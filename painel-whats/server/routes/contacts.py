"""Contact CRUD and messaging endpoints."""

import asyncio
import logging
import time
from pathlib import Path

from fastapi import File, Form, Request, Response, UploadFile
from fastapi.responses import FileResponse
from gowa.client import GOWASendError, extract_msg_id

from db.repositories import contact_repo, message_repo
from server.helpers import _ok, _err

logger = logging.getLogger(__name__)


def register_routes(app, deps):
    agent_handler = deps.agent_handler
    gowa_client = deps.gowa_client
    ws_manager = deps.ws_manager
    state = deps.state
    settings = deps.settings
    statics_senditems_dir = deps.statics_senditems_dir

    async def _send_read_receipts(phone: str, msg_ids: list[str]):
        """Send read receipts to GOWA in background (best-effort)."""
        for mid in msg_ids:
            try:
                await asyncio.to_thread(gowa_client.mark_as_read, mid, phone)
                logger.info("[ReadReceipt] Sent for %s msg %s", phone, mid)
            except Exception as e:
                logger.warning("[ReadReceipt] Failed for %s msg %s: %s", phone, mid, e)

    @app.get("/api/contacts")
    async def list_contacts(q: str = "", archived: bool = False):
        """List all contacts with summary info."""
        results = await asyncio.to_thread(contact_repo.list_contacts, q, archived)
        return _ok(results)

    @app.post("/api/contacts/check-phone")
    async def check_phone(request: Request):
        """Check if a phone number is registered on WhatsApp."""
        body = await request.json()
        phone = (body.get("phone") or "").strip()
        if not phone:
            return _err("Campo 'phone' é obrigatório.")

        # Normalize: strip non-digits, ensure country code
        digits = "".join(c for c in phone if c.isdigit())
        if len(digits) < 10:
            return _err("Número inválido. Informe DDD + número.")
        if not digits.startswith("55"):
            digits = "55" + digits

        try:
            result = await asyncio.to_thread(gowa_client.check_phone, digits)
        except GOWASendError as e:
            return _err(f"Erro ao verificar número: {e}")

        registered = result.get("registered", False)
        name = result.get("name", "")
        # Use canonical phone from WhatsApp (avoids BR 12/13 digit duplicates)
        canonical = result.get("canonical_phone", digits) if registered else digits

        # If registered, pre-create contact with WhatsApp name and AI setting
        if registered:
            ai_default = settings.get("default_ai_enabled", True)
            def _save():
                contact_repo.get_or_create(canonical, default_ai_enabled=ai_default)
                if name:
                    c = contact_repo.get_by_phone(canonical)
                    if c and not c["name"]:
                        contact_repo.update(c["id"], name=f"~{name}")
            await asyncio.to_thread(_save)

        return _ok({
            "phone": canonical,
            "registered": registered,
            "jid": result.get("jid", ""),
            "name": name,
        })

    @app.get("/api/contacts/{phone}")
    async def get_contact(phone: str, mark_read: bool = True):
        """Return full contact data including conversation history."""
        def _load():
            data = contact_repo.get_full_contact(phone)
            if data is None:
                # Auto-create contact for verified phone numbers
                ai_default = settings.get("default_ai_enabled", True)
                contact_repo.get_or_create(phone, default_ai_enabled=ai_default)
                data = contact_repo.get_full_contact(phone)
            if data is None:
                return None, []
            contact_id = data["id"]
            # Mark as read when viewing contact (skip if mark_read=false)
            msg_ids = []
            if mark_read and (data.get("unread_count", 0) > 0 or data.get("unread_ai_count", 0) > 0):
                msg_ids = contact_repo.mark_as_read(contact_id)
                data["unread_count"] = 0
                data["unread_ai_count"] = 0
                # Update in-memory cache
                if phone in agent_handler._contacts:
                    agent_handler._contacts[phone].unread_count = 0
                    agent_handler._contacts[phone].unread_ai_count = 0
            # Load messages
            data["messages"] = message_repo.get_all(contact_id)
            # Load usage for the full response
            data["usage"] = []
            return data, msg_ids
        data, msg_ids = await asyncio.to_thread(_load)
        if data is None:
            return _err("Contato não encontrado.", status=404)
        if msg_ids:
            asyncio.create_task(_send_read_receipts(phone, msg_ids))
        # Check group send permissions (fresh check on every contact load)
        if data.get("is_group") and state.bot_phone:
            try:
                can_send = await asyncio.to_thread(
                    gowa_client.can_bot_send_in_group, phone, state.bot_phone)
                if data.get("can_send", True) != can_send:
                    await asyncio.to_thread(
                        contact_repo.update, data["id"], can_send=1 if can_send else 0)
                    data["can_send"] = can_send
                    if phone in agent_handler._contacts:
                        agent_handler._contacts[phone].can_send = can_send
            except Exception as e:
                logger.warning("[Contact] Failed to check group send permission: %s", e)
        return _ok(data)

    @app.delete("/api/contacts/{phone}")
    async def delete_contact(phone: str):
        """Permanently delete a contact and all associated data."""
        def _delete():
            data = contact_repo.get_by_phone(phone)
            if data is None:
                return False
            contact_repo.delete(data["id"])
            # Clear in-memory cache
            agent_handler._contacts.pop(phone, None)
            return True
        found = await asyncio.to_thread(_delete)
        if not found:
            return _err("Contato não encontrado.", status=404)
        logger.info("[Contact] Deleted contact %s", phone)
        await ws_manager.broadcast("contact_deleted", {"phone": phone})
        return _ok({"message": "Contato apagado."})

    @app.post("/api/contacts/{phone}/archive")
    async def archive_contact(phone: str, body: dict):
        """Archive or unarchive a contact (by app)."""
        archived = body.get("archived")
        if archived is None:
            return _err("Campo 'archived' é obrigatório.")
        def _archive():
            data = contact_repo.get_by_phone(phone)
            if data is None:
                return None
            contact_repo.set_archived(data["id"], bool(archived), by_app=True)
            # Update in-memory cache
            if phone in agent_handler._contacts:
                agent_handler._contacts[phone].is_archived = bool(archived)
                agent_handler._contacts[phone].archived_by_app = bool(archived)
            return bool(archived)
        result = await asyncio.to_thread(_archive)
        if result is None:
            return _err("Contato não encontrado.", status=404)
        logger.info("[Contact] %s contact %s", "Archived" if result else "Unarchived", phone)
        await ws_manager.broadcast("contact_archived", {"phone": phone, "archived": result})
        return _ok({"archived": result})

    @app.post("/api/contacts/{phone}/send")
    async def send_to_contact(phone: str, body: dict):
        """Send a manual message to a contact (operator-initiated, no LLM)."""
        message = (body.get("message") or "").strip()
        if not message:
            return _err("Campo 'message' é obrigatório.")

        # Track sent message to filter GOWA echo-backs (must be before send)
        state.recently_sent[f"{phone}:{message[:120]}"] = time.time()

        # Try to send via GOWA — always save message (with status on failure)
        send_failed = False
        error_msg = ""
        send_result = None
        try:
            send_result = await asyncio.to_thread(gowa_client.send_message, phone, message)
        except GOWASendError as e:
            logger.error("[Send] Failed to send message to %s: %s", phone, e)
            send_failed = True
            error_msg = str(e)
        except Exception as e:
            logger.error("[Send] Failed to send message to %s: %s", phone, e)
            send_failed = True
            error_msg = str(e)

        msg_id = extract_msg_id(send_result) if not send_failed else None

        # Always save to contact memory (with status="failed" if send failed)
        try:
            msg_data = await asyncio.to_thread(
                agent_handler.save_operator_message, phone, message,
                status="failed" if send_failed else "sent",
                msg_id=msg_id,
            )
        except Exception as e:
            logger.error("[Send] Failed to save message for %s: %s", phone, e)
            return _err(f"Erro ao salvar mensagem: {e}", status=500)

        if send_failed:
            # Broadcast error event for frontend toast/error bubble
            await ws_manager.broadcast("new_message", {
                "phone": phone,
                "message": {
                    "role": "error",
                    "content": f"Falha ao enviar mensagem: {error_msg}",
                    "ts": time.time(),
                },
            })
            return _err(f"Falha ao enviar mensagem: {error_msg}", status=500)

        logger.info("[Send] Manual message to %s: %s", phone, message[:80])

        # Broadcast to all WS clients
        await ws_manager.broadcast("new_message", {
            "phone": phone,
            "message": msg_data,
        })

        return _ok({"message": "Mensagem enviada.", "msg_id": msg_id})

    @app.post("/api/contacts/{phone}/retry-send")
    async def retry_send_to_contact(phone: str, body: dict):
        """Retry sending a message that previously failed."""
        message = (body.get("message") or "").strip()
        if not message:
            return _err("Campo 'message' é obrigatório.")

        # Track for echo-back filtering
        state.recently_sent[f"{phone}:{message[:120]}"] = time.time()

        send_result = None
        try:
            send_result = await asyncio.to_thread(gowa_client.send_message, phone, message)
        except GOWASendError as e:
            logger.error("[Retry] Failed to resend to %s: %s", phone, e)
            await ws_manager.broadcast("new_message", {
                "phone": phone,
                "message": {
                    "role": "error",
                    "content": f"Falha ao reenviar mensagem: {e}",
                    "ts": time.time(),
                },
            })
            return _err(f"Falha ao reenviar: {e}", status=500)
        except Exception as e:
            logger.error("[Retry] Failed to resend to %s: %s", phone, e)
            await ws_manager.broadcast("new_message", {
                "phone": phone,
                "message": {
                    "role": "error",
                    "content": f"Erro inesperado ao reenviar: {e}",
                    "ts": time.time(),
                },
            })
            return _err(f"Erro ao reenviar: {e}", status=500)

        msg_id = extract_msg_id(send_result)

        # Mark the existing failed message as sent
        try:
            await asyncio.to_thread(agent_handler.mark_message_sent, phone, message, msg_id)
        except Exception as e:
            logger.error("[Retry] Failed to update message status for %s: %s", phone, e)

        state.msg_count += 1
        logger.info("[Retry] Resent to %s: %s", phone, message[:80])
        return _ok({"message": "Mensagem reenviada."})

    @app.post("/api/contacts/{phone}/send-image")
    async def send_image_to_contact(
        phone: str,
        image: UploadFile = File(...),
        caption: str = Form(""),
    ):
        """Send an image to a contact (operator-initiated)."""
        suffix = Path(image.filename or "img.png").suffix or ".png"
        dest = statics_senditems_dir / f"{int(time.time() * 1000)}{suffix}"
        content = await image.read()
        dest.write_bytes(content)

        send_result = None
        try:
            send_result = await asyncio.to_thread(gowa_client.send_image, phone, str(dest), caption)
        except GOWASendError as e:
            logger.error("[Send] Failed to send image to %s: %s", phone, e)
            await ws_manager.broadcast("new_message", {
                "phone": phone,
                "message": {
                    "role": "error",
                    "content": f"Falha ao enviar imagem: {e}",
                    "ts": time.time(),
                },
            })
            return _err(f"Falha ao enviar imagem: {e}", status=500)
        except Exception as e:
            logger.error("[Send] Failed to send image to %s: %s", phone, e)
            await ws_manager.broadcast("new_message", {
                "phone": phone,
                "message": {
                    "role": "error",
                    "content": f"Erro inesperado ao enviar imagem: {e}",
                    "ts": time.time(),
                },
            })
            return _err(f"Erro ao enviar imagem: {e}", status=500)

        msg_id = extract_msg_id(send_result)

        # Relative path for storage and frontend
        rel_path = f"statics/senditems/{dest.name}"
        msg_data = {
            "role": "assistant",
            "content": caption,
            "ts": time.time(),
            "media_type": "image",
            "media_path": rel_path,
            "status": "sent",
            "msg_id": msg_id,
        }
        contact = agent_handler._get_contact(phone)
        contact.add_message("assistant", caption, media_type="image", media_path=rel_path,
                            status="sent", msg_id=msg_id)

        await ws_manager.broadcast("new_message", {"phone": phone, "message": msg_data})
        logger.info("[Send] Image sent to %s", phone)
        return _ok({"message": "Imagem enviada."})

    @app.post("/api/contacts/{phone}/send-audio")
    async def send_audio_to_contact(
        phone: str,
        audio: UploadFile = File(...),
    ):
        """Send an audio file to a contact (operator-initiated)."""
        suffix = Path(audio.filename or "voice.ogg").suffix or ".ogg"
        dest = statics_senditems_dir / f"{int(time.time() * 1000)}{suffix}"
        content = await audio.read()
        dest.write_bytes(content)

        send_result = None
        try:
            send_result = await asyncio.to_thread(gowa_client.send_audio, phone, str(dest))
        except GOWASendError as e:
            logger.error("[Send] Failed to send audio to %s: %s", phone, e)
            await ws_manager.broadcast("new_message", {
                "phone": phone,
                "message": {
                    "role": "error",
                    "content": f"Falha ao enviar áudio: {e}",
                    "ts": time.time(),
                },
            })
            return _err(f"Falha ao enviar áudio: {e}", status=500)
        except Exception as e:
            logger.error("[Send] Failed to send audio to %s: %s", phone, e)
            await ws_manager.broadcast("new_message", {
                "phone": phone,
                "message": {
                    "role": "error",
                    "content": f"Erro inesperado ao enviar áudio: {e}",
                    "ts": time.time(),
                },
            })
            return _err(f"Erro ao enviar áudio: {e}", status=500)

        msg_id = extract_msg_id(send_result)

        rel_path = f"statics/senditems/{dest.name}"
        msg_data = {
            "role": "assistant",
            "content": "[Áudio]",
            "ts": time.time(),
            "media_type": "audio",
            "media_path": rel_path,
            "status": "sent",
            "msg_id": msg_id,
        }
        contact = agent_handler._get_contact(phone)
        contact.add_message("assistant", "[Áudio]", media_type="audio", media_path=rel_path,
                            status="sent", msg_id=msg_id)

        await ws_manager.broadcast("new_message", {"phone": phone, "message": msg_data})
        logger.info("[Send] Audio sent to %s", phone)
        return _ok({"message": "Áudio enviado."})

    @app.post("/api/contacts/{phone}/send-video")
    async def send_video_to_contact(
        phone: str,
        video: UploadFile = File(...),
        caption: str = Form(""),
    ):
        """Send a video to a contact (operator-initiated)."""
        suffix = Path(video.filename or "video.mp4").suffix or ".mp4"
        dest = statics_senditems_dir / f"{int(time.time() * 1000)}{suffix}"
        content = await video.read()
        dest.write_bytes(content)

        send_result = None
        try:
            send_result = await asyncio.to_thread(
                gowa_client.send_video, phone, str(dest), caption
            )
        except GOWASendError as e:
            logger.error("[Send] Failed to send video to %s: %s", phone, e)
            await ws_manager.broadcast("new_message", {
                "phone": phone,
                "message": {"role": "error", "content": f"Falha ao enviar vídeo: {e}", "ts": time.time()},
            })
            return _err(f"Falha ao enviar vídeo: {e}", status=500)
        except Exception as e:
            logger.error("[Send] Failed to send video to %s: %s", phone, e)
            await ws_manager.broadcast("new_message", {
                "phone": phone,
                "message": {"role": "error", "content": f"Erro inesperado ao enviar vídeo: {e}", "ts": time.time()},
            })
            return _err(f"Erro inesperado ao enviar vídeo: {e}", status=500)

    @app.post("/api/contacts/{phone}/send-video")
    async def send_video_to_contact(
        phone: str,
        video: UploadFile = File(...),
        caption: str = Form(""),
    ):
        """Send a video to a contact (operator-initiated)."""
        suffix = Path(video.filename or "video.mp4").suffix or ".mp4"
        dest = statics_senditems_dir / f"{int(time.time() * 1000)}{suffix}"
        content = await video.read()
        dest.write_bytes(content)

        send_result = None
        try:
            send_result = await asyncio.to_thread(
                gowa_client.send_video, phone, str(dest), caption
            )
        except GOWASendError as e:
            logger.error("[Send] Failed to send video to %s: %s", phone, e)
            await ws_manager.broadcast("new_message", {
                "phone": phone,
                "message": {"role": "error", "content": f"Falha ao enviar vídeo: {e}", "ts": time.time()},
            })
            return _err(f"Falha ao enviar vídeo: {e}", status=500)
        except Exception as e:
            logger.error("[Send] Failed to send video to %s: %s", phone, e)
            await ws_manager.broadcast("new_message", {
                "phone": phone,
                "message": {"role": "error", "content": f"Erro inesperado ao enviar vídeo: {e}", "ts": time.time()},
            })
            return _err(f"Erro inesperado ao enviar vídeo: {e}", status=500)

        msg_id = extract_msg_id(send_result)
        rel_path = f"statics/senditems/{dest.name}"
        contact = agent_handler._get_contact(phone)
        contact.add_message(
            "assistant", caption or "[Vídeo]", media_type="video", media_path=rel_path,
            status="sent", msg_id=msg_id,
        )
        await ws_manager.broadcast("new_message", {"phone": phone, "message": {
            "role": "assistant", "content": caption or "[Vídeo]", "ts": time.time(),
            "media_type": "video", "media_path": rel_path, "status": "sent", "msg_id": msg_id,
        }})
        logger.info("[Send] Video sent to %s", phone)
        return _ok({"message": "Vídeo enviado."})

    @app.post("/api/contacts/{phone}/send-sticker")
    async def send_sticker_to_contact(
        phone: str,
        image: UploadFile = File(...),
    ):
        """Send a sticker image to a contact (operator-initiated)."""
        suffix = Path(image.filename or "sticker.png").suffix or ".png"
        dest = statics_senditems_dir / f"{int(time.time() * 1000)}{suffix}"
        content = await image.read()
        dest.write_bytes(content)

        send_result = None
        try:
            send_result = await asyncio.to_thread(
                gowa_client.send_sticker, phone, str(dest)
            )
        except GOWASendError as e:
            logger.error("[Send] Failed to send sticker to %s: %s", phone, e)
            await ws_manager.broadcast("new_message", {
                "phone": phone,
                "message": {"role": "error", "content": f"Falha ao enviar sticker: {e}", "ts": time.time()},
            })
            return _err(f"Falha ao enviar sticker: {e}", status=500)
        except Exception as e:
            logger.error("[Send] Failed to send sticker to %s: %s", phone, e)
            await ws_manager.broadcast("new_message", {
                "phone": phone,
                "message": {"role": "error", "content": f"Erro inesperado ao enviar sticker: {e}", "ts": time.time()},
            })
            return _err(f"Erro inesperado ao enviar sticker: {e}", status=500)

        msg_id = extract_msg_id(send_result)
        rel_path = f"statics/senditems/{dest.name}"
        contact = agent_handler._get_contact(phone)
        contact.add_message(
            "assistant", "[Sticker]", media_type="sticker", media_path=rel_path,
            status="sent", msg_id=msg_id,
        )
        await ws_manager.broadcast("new_message", {"phone": phone, "message": {
            "role": "assistant", "content": "[Sticker]", "ts": time.time(),
            "media_type": "sticker", "media_path": rel_path, "status": "sent", "msg_id": msg_id,
        }})
        logger.info("[Send] Sticker sent to %s", phone)
        return _ok({"message": "Sticker enviado."})

    @app.post("/api/contacts/{phone}/send-document")
    async def send_document_to_contact(
        phone: str,
        document: UploadFile = File(...),
        caption: str = Form(""),
    ):
        """Send a document to a contact (operator-initiated)."""
        suffix = Path(document.filename or "file.pdf").suffix or ".pdf"
        dest = statics_senditems_dir / f"{int(time.time() * 1000)}{suffix}"
        content = await document.read()
        dest.write_bytes(content)

        send_result = None
        try:
            send_result = await asyncio.to_thread(
                gowa_client.send_document, phone, str(dest), caption
            )
        except GOWASendError as e:
            logger.error("[Send] Failed to send document to %s: %s", phone, e)
            await ws_manager.broadcast("new_message", {
                "phone": phone,
                "message": {"role": "error", "content": f"Falha ao enviar documento: {e}", "ts": time.time()},
            })
            return _err(f"Falha ao enviar documento: {e}", status=500)
        except Exception as e:
            logger.error("[Send] Failed to send document to %s: %s", phone, e)
            await ws_manager.broadcast("new_message", {
                "phone": phone,
                "message": {"role": "error", "content": f"Erro inesperado ao enviar documento: {e}", "ts": time.time()},
            })
            return _err(f"Erro inesperado ao enviar documento: {e}", status=500)

        msg_id = extract_msg_id(send_result)
        rel_path = f"statics/senditems/{dest.name}"
        contact = agent_handler._get_contact(phone)
        contact.add_message(
            "assistant", caption or "[Documento]", media_type="document", media_path=rel_path,
            status="sent", msg_id=msg_id,
        )
        await ws_manager.broadcast("new_message", {"phone": phone, "message": {
            "role": "assistant", "content": caption or "[Documento]", "ts": time.time(),
            "media_type": "document", "media_path": rel_path, "status": "sent", "msg_id": msg_id,
        }})
        logger.info("[Send] Document sent to %s", phone)
        return _ok({"message": "Documento enviado."})

    @app.post("/api/contacts/{phone}/send-contact")
    async def send_contact_to_contact(phone: str, body: dict):
        """Send a contact card to a contact (operator-initiated)."""
        contact_name = (body.get("contact_name") or "").strip()
        contact_phone = (body.get("contact_phone") or "").strip()
        if not contact_name or not contact_phone:
            return _err("Campos 'contact_name' e 'contact_phone' são obrigatórios.")
        try:
            send_result = await asyncio.to_thread(
                gowa_client.send_contact, phone, contact_name, contact_phone
            )
        except GOWASendError as e:
            logger.error("[Send] Failed to send contact to %s: %s", phone, e)
            await ws_manager.broadcast("new_message", {
                "phone": phone,
                "message": {"role": "error", "content": f"Falha ao enviar contato: {e}", "ts": time.time()},
            })
            return _err(f"Falha ao enviar contato: {e}", status=500)
        except Exception as e:
            logger.error("[Send] Failed to send contact to %s: %s", phone, e)
            await ws_manager.broadcast("new_message", {
                "phone": phone,
                "message": {"role": "error", "content": f"Erro inesperado ao enviar contato: {e}", "ts": time.time()},
            })
            return _err(f"Erro inesperado ao enviar contato: {e}", status=500)

        msg_id = extract_msg_id(send_result)
        contact = agent_handler._get_contact(phone)
        contact.add_message(
            "assistant", f"[Contato] {contact_name}", media_type="contact",
            status="sent", msg_id=msg_id,
        )
        await ws_manager.broadcast("new_message", {"phone": phone, "message": {
            "role": "assistant", "content": f"[Contato] {contact_name}", "ts": time.time(),
            "media_type": "contact", "status": "sent", "msg_id": msg_id,
        }})
        logger.info("[Send] Contact sent to %s", phone)
        return _ok({"message": "Contato enviado."})

    @app.post("/api/contacts/{phone}/send-link")
    async def send_link_to_contact(phone: str, body: dict):
        """Send a link message to a contact (operator-initiated)."""
        url = (body.get("url") or "").strip()
        caption = (body.get("caption") or "").strip()
        if not url:
            return _err("Campo 'url' é obrigatório.")
        try:
            send_result = await asyncio.to_thread(
                gowa_client.send_link, phone, url, caption
            )
        except GOWASendError as e:
            logger.error("[Send] Failed to send link to %s: %s", phone, e)
            await ws_manager.broadcast("new_message", {
                "phone": phone,
                "message": {"role": "error", "content": f"Falha ao enviar link: {e}", "ts": time.time()},
            })
            return _err(f"Falha ao enviar link: {e}", status=500)
        except Exception as e:
            logger.error("[Send] Failed to send link to %s: %s", phone, e)
            await ws_manager.broadcast("new_message", {
                "phone": phone,
                "message": {"role": "error", "content": f"Erro inesperado ao enviar link: {e}", "ts": time.time()},
            })
            return _err(f"Erro inesperado ao enviar link: {e}", status=500)

        msg_id = extract_msg_id(send_result)
        contact = agent_handler._get_contact(phone)
        contact.add_message(
            "assistant", f"[Link] {caption or url}", media_type="link",
            status="sent", msg_id=msg_id,
        )
        await ws_manager.broadcast("new_message", {"phone": phone, "message": {
            "role": "assistant", "content": f"[Link] {caption or url}", "ts": time.time(),
            "media_type": "link", "status": "sent", "msg_id": msg_id,
        }})
        logger.info("[Send] Link sent to %s", phone)
        return _ok({"message": "Link enviado."})

    @app.post("/api/contacts/{phone}/send-location")
    async def send_location_to_contact(phone: str, body: dict):
        """Send a location message to a contact (operator-initiated)."""
        latitude = body.get("latitude")
        longitude = body.get("longitude")
        name = (body.get("name") or "").strip()
        if latitude is None or longitude is None:
            return _err("Campos 'latitude' e 'longitude' são obrigatórios.")
        try:
            send_result = await asyncio.to_thread(
                gowa_client.send_location, phone, float(latitude), float(longitude), name
            )
        except GOWASendError as e:
            logger.error("[Send] Failed to send location to %s: %s", phone, e)
            await ws_manager.broadcast("new_message", {
                "phone": phone,
                "message": {"role": "error", "content": f"Falha ao enviar localização: {e}", "ts": time.time()},
            })
            return _err(f"Falha ao enviar localização: {e}", status=500)
        except Exception as e:
            logger.error("[Send] Failed to send location to %s: %s", phone, e)
            await ws_manager.broadcast("new_message", {
                "phone": phone,
                "message": {"role": "error", "content": f"Erro inesperado ao enviar localização: {e}", "ts": time.time()},
            })
            return _err(f"Erro inesperado ao enviar localização: {e}", status=500)

        msg_id = extract_msg_id(send_result)
        contact = agent_handler._get_contact(phone)
        contact.add_message(
            "assistant", f"[Localização] {name or str(latitude)+','+str(longitude)}",
            media_type="location", status="sent", msg_id=msg_id,
        )
        await ws_manager.broadcast("new_message", {"phone": phone, "message": {
            "role": "assistant", "content": f"[Localização] {name or ''}", "ts": time.time(),
            "media_type": "location", "status": "sent", "msg_id": msg_id,
        }})
        logger.info("[Send] Location sent to %s", phone)
        return _ok({"message": "Localização enviada."})

    @app.post("/api/contacts/{phone}/send-poll")
    async def send_poll_to_contact(phone: str, body: dict):
        """Send a poll message to a contact (operator-initiated)."""
        name = (body.get("name") or "").strip()
        options = body.get("options") or []
        if not name or not isinstance(options, list) or len(options) < 2:
            return _err("Enquete precisa de 'name' e pelo menos 2 'options'.")
        options = [str(o).strip() for o in options[:10] if str(o).strip()]
        if len(options) < 2:
            return _err("Informe pelo menos 2 opções válidas para a enquete.")
        try:
            send_result = await asyncio.to_thread(
                gowa_client.send_poll, phone, name, options
            )
        except GOWASendError as e:
            logger.error("[Send] Failed to send poll to %s: %s", phone, e)
            await ws_manager.broadcast("new_message", {
                "phone": phone,
                "message": {"role": "error", "content": f"Falha ao enviar enquete: {e}", "ts": time.time()},
            })
            return _err(f"Falha ao enviar enquete: {e}", status=500)
        except Exception as e:
            logger.error("[Send] Failed to send poll to %s: %s", phone, e)
            await ws_manager.broadcast("new_message", {
                "phone": phone,
                "message": {"role": "error", "content": f"Erro inesperado ao enviar enquete: {e}", "ts": time.time()},
            })
            return _err(f"Erro inesperado ao enviar enquete: {e}", status=500)

        msg_id = extract_msg_id(send_result)
        contact = agent_handler._get_contact(phone)
        contact.add_message(
            "assistant", f"[Enquete] {name}", media_type="poll",
            status="sent", msg_id=msg_id,
        )
        await ws_manager.broadcast("new_message", {"phone": phone, "message": {
            "role": "assistant", "content": f"[Enquete] {name}", "ts": time.time(),
            "media_type": "poll", "status": "sent", "msg_id": msg_id,
        }})
        logger.info("[Send] Poll sent to %s", phone)
        return _ok({"message": "Enquete enviada."})

    @app.post("/api/contacts/{phone}/send-sticker")
    async def send_sticker_to_contact(
        phone: str,
        image: UploadFile = File(...),
    ):
        """Send a sticker image to a contact (operator-initiated)."""
        suffix = Path(image.filename or "sticker.png").suffix or ".png"
        dest = statics_senditems_dir / f"{int(time.time() * 1000)}{suffix}"
        content = await image.read()
        dest.write_bytes(content)

        send_result = None
        try:
            send_result = await asyncio.to_thread(
                gowa_client.send_sticker, phone, str(dest)
            )
        except GOWASendError as e:
            logger.error("[Send] Failed to send sticker to %s: %s", phone, e)
            await ws_manager.broadcast("new_message", {
                "phone": phone,
                "message": {"role": "error", "content": f"Falha ao enviar sticker: {e}", "ts": time.time()},
            })
            return _err(f"Falha ao enviar sticker: {e}", status=500)
        except Exception as e:
            logger.error("[Send] Failed to send sticker to %s: %s", phone, e)
            await ws_manager.broadcast("new_message", {
                "phone": phone,
                "message": {"role": "error", "content": f"Erro inesperado ao enviar sticker: {e}", "ts": time.time()},
            })
            return _err(f"Erro inesperado ao enviar sticker: {e}", status=500)

        msg_id = extract_msg_id(send_result)
        rel_path = f"statics/senditems/{dest.name}"
        contact = agent_handler._get_contact(phone)
        contact.add_message(
            "assistant", "[Sticker]", media_type="sticker", media_path=rel_path,
            status="sent", msg_id=msg_id,
        )
        await ws_manager.broadcast("new_message", {"phone": phone, "message": {
            "role": "assistant", "content": "[Sticker]", "ts": time.time(),
            "media_type": "sticker", "media_path": rel_path, "status": "sent", "msg_id": msg_id,
        }})
        logger.info("[Send] Sticker sent to %s", phone)
        return _ok({"message": "Sticker enviado."})

    @app.post("/api/contacts/{phone}/send-document")
    async def send_document_to_contact(
        phone: str,
        document: UploadFile = File(...),
        caption: str = Form(""),
    ):
        """Send a document to a contact (operator-initiated)."""
        suffix = Path(document.filename or "file.pdf").suffix or ".pdf"
        dest = statics_senditems_dir / f"{int(time.time() * 1000)}{suffix}"
        content = await document.read()
        dest.write_bytes(content)

        send_result = None
        try:
            send_result = await asyncio.to_thread(
                gowa_client.send_document, phone, str(dest), caption
            )
        except GOWASendError as e:
            logger.error("[Send] Failed to send document to %s: %s", phone, e)
            await ws_manager.broadcast("new_message", {
                "phone": phone,
                "message": {"role": "error", "content": f"Falha ao enviar documento: {e}", "ts": time.time()},
            })
            return _err(f"Falha ao enviar documento: {e}", status=500)
        except Exception as e:
            logger.error("[Send] Failed to send document to %s: %s", phone, e)
            await ws_manager.broadcast("new_message", {
                "phone": phone,
                "message": {"role": "error", "content": f"Erro inesperado ao enviar documento: {e}", "ts": time.time()},
            })
            return _err(f"Erro inesperado ao enviar documento: {e}", status=500)

        msg_id = extract_msg_id(send_result)
        rel_path = f"statics/senditems/{dest.name}"
        contact = agent_handler._get_contact(phone)
        contact.add_message(
            "assistant", caption or "[Documento]", media_type="document", media_path=rel_path,
            status="sent", msg_id=msg_id,
        )
        await ws_manager.broadcast("new_message", {"phone": phone, "message": {
            "role": "assistant", "content": caption or "[Documento]", "ts": time.time(),
            "media_type": "document", "media_path": rel_path, "status": "sent", "msg_id": msg_id,
        }})
        logger.info("[Send] Document sent to %s", phone)
        return _ok({"message": "Documento enviado."})

    @app.post("/api/contacts/{phone}/send-contact")
    async def send_contact_to_contact(phone: str, body: dict):
        """Send a contact card to a contact (operator-initiated)."""
        contact_name = (body.get("contact_name") or "").strip()
        contact_phone_number = (body.get("contact_phone") or "").strip()
        if not contact_name or not contact_phone_number:
            return _err("Campos 'contact_name' e 'contact_phone' são obrigatórios.")
        try:
            send_result = await asyncio.to_thread(
                gowa_client.send_contact, phone, contact_name, contact_phone_number
            )
        except GOWASendError as e:
            logger.error("[Send] Failed to send contact to %s: %s", phone, e)
            await ws_manager.broadcast("new_message", {
                "phone": phone,
                "message": {"role": "error", "content": f"Falha ao enviar contato: {e}", "ts": time.time()},
            })
            return _err(f"Falha ao enviar contato: {e}", status=500)
        except Exception as e:
            logger.error("[Send] Failed to send contact to %s: %s", phone, e)
            await ws_manager.broadcast("new_message", {
                "phone": phone,
                "message": {"role": "error", "content": f"Erro inesperado ao enviar contato: {e}", "ts": time.time()},
            })
            return _err(f"Erro inesperado ao enviar contato: {e}", status=500)

        msg_id = extract_msg_id(send_result)
        contact = agent_handler._get_contact(phone)
        contact.add_message(
            "assistant", f"[Contato] {contact_name}", media_type="contact",
            status="sent", msg_id=msg_id,
        )
        await ws_manager.broadcast("new_message", {"phone": phone, "message": {
            "role": "assistant", "content": f"[Contato] {contact_name}", "ts": time.time(),
            "media_type": "contact", "status": "sent", "msg_id": msg_id,
        }})
        logger.info("[Send] Contact sent to %s", phone)
        return _ok({"message": "Contato enviado."})

    @app.post("/api/contacts/{phone}/send-link")
    async def send_link_to_contact(phone: str, body: dict):
        """Send a link message to a contact (operator-initiated)."""
        url = (body.get("url") or "").strip()
        caption = (body.get("caption") or "").strip()
        if not url:
            return _err("Campo 'url' é obrigatório.")
        try:
            send_result = await asyncio.to_thread(
                gowa_client.send_link, phone, url, caption
            )
        except GOWASendError as e:
            logger.error("[Send] Failed to send link to %s: %s", phone, e)
            await ws_manager.broadcast("new_message", {
                "phone": phone,
                "message": {"role": "error", "content": f"Falha ao enviar link: {e}", "ts": time.time()},
            })
            return _err(f"Falha ao enviar link: {e}", status=500)
        except Exception as e:
            logger.error("[Send] Failed to send link to %s: %s", phone, e)
            await ws_manager.broadcast("new_message", {
                "phone": phone,
                "message": {"role": "error", "content": f"Erro inesperado ao enviar link: {e}", "ts": time.time()},
            })
            return _err(f"Erro inesperado ao enviar link: {e}", status=500)

        msg_id = extract_msg_id(send_result)
        contact = agent_handler._get_contact(phone)
        contact.add_message(
            "assistant", f"[Link] {caption or url}", media_type="link",
            status="sent", msg_id=msg_id,
        )
        await ws_manager.broadcast("new_message", {"phone": phone, "message": {
            "role": "assistant", "content": f"[Link] {caption or url}", "ts": time.time(),
            "media_type": "link", "status": "sent", "msg_id": msg_id,
        }})
        logger.info("[Send] Link sent to %s", phone)
        return _ok({"message": "Link enviado."})

    @app.post("/api/contacts/{phone}/send-location")
    async def send_location_to_contact(phone: str, body: dict):
        """Send a location message to a contact (operator-initiated)."""
        latitude = body.get("latitude")
        longitude = body.get("longitude")
        name = (body.get("name") or "").strip()
        if latitude is None or longitude is None:
            return _err("Campos 'latitude' e 'longitude' são obrigatórios.")
        try:
            send_result = await asyncio.to_thread(
                gowa_client.send_location, phone, float(latitude), float(longitude), name
            )
        except GOWASendError as e:
            logger.error("[Send] Failed to send location to %s: %s", phone, e)
            await ws_manager.broadcast("new_message", {
                "phone": phone,
                "message": {"role": "error", "content": f"Falha ao enviar localização: {e}", "ts": time.time()},
            })
            return _err(f"Falha ao enviar localização: {e}", status=500)
        except Exception as e:
            logger.error("[Send] Failed to send location to %s: %s", phone, e)
            await ws_manager.broadcast("new_message", {
                "phone": phone,
                "message": {"role": "error", "content": f"Erro inesperado ao enviar localização: {e}", "ts": time.time()},
            })
            return _err(f"Erro inesperado ao enviar localização: {e}", status=500)

        msg_id = extract_msg_id(send_result)
        contact = agent_handler._get_contact(phone)
        contact.add_message(
            "assistant", f"[Localização] {name or str(latitude)+','+str(longitude)}",
            media_type="location", status="sent", msg_id=msg_id,
        )
        await ws_manager.broadcast("new_message", {"phone": phone, "message": {
            "role": "assistant", "content": f"[Localização] {name or ''}", "ts": time.time(),
            "media_type": "location", "status": "sent", "msg_id": msg_id,
        }})
        logger.info("[Send] Location sent to %s", phone)
        return _ok({"message": "Localização enviada."})

    @app.post("/api/contacts/{phone}/send-poll")
    async def send_poll_to_contact(phone: str, body: dict):
        """Send a poll message to a contact (operator-initiated)."""
        name = (body.get("name") or "").strip()
        options = body.get("options") or []
        if not name or not isinstance(options, list) or len(options) < 2:
            return _err("Enquete precisa de 'name' e pelo menos 2 'options'.")
        options = [str(o).strip() for o in options[:10] if str(o).strip()]
        if len(options) < 2:
            return _err("Informe pelo menos 2 opções válidas para a enquete.")
        try:
            send_result = await asyncio.to_thread(
                gowa_client.send_poll, phone, name, options
            )
        except GOWASendError as e:
            logger.error("[Send] Failed to send poll to %s: %s", phone, e)
            await ws_manager.broadcast("new_message", {
                "phone": phone,
                "message": {"role": "error", "content": f"Falha ao enviar enquete: {e}", "ts": time.time()},
            })
            return _err(f"Falha ao enviar enquete: {e}", status=500)
        except Exception as e:
            logger.error("[Send] Failed to send poll to %s: %s", phone, e)
            await ws_manager.broadcast("new_message", {
                "phone": phone,
                "message": {"role": "error", "content": f"Erro inesperado ao enviar enquete: {e}", "ts": time.time()},
            })
            return _err(f"Erro inesperado ao enviar enquete: {e}", status=500)

        msg_id = extract_msg_id(send_result)
        contact = agent_handler._get_contact(phone)
        contact.add_message(
            "assistant", f"[Enquete] {name}", media_type="poll",
            status="sent", msg_id=msg_id,
        )
        await ws_manager.broadcast("new_message", {"phone": phone, "message": {
            "role": "assistant", "content": f"[Enquete] {name}", "ts": time.time(),
            "media_type": "poll", "status": "sent", "msg_id": msg_id,
        }})
        logger.info("[Send] Poll sent to %s", phone)
        return _ok({"message": "Enquete enviada."})

    @app.post("/api/contacts/{phone}/presence")
    async def send_presence_to_contact(phone: str, body: dict):
        """Send typing/stop presence indicator to a contact (operator-initiated)."""
        action = body.get("action", "start")
        await asyncio.to_thread(gowa_client.send_chat_presence, phone, action)
        return _ok({"status": "ok"})

    @app.post("/api/contacts/{phone}/read")
    async def mark_contact_read(phone: str):
        """Mark all messages from this contact as read (reset unread_count)."""
        def _mark():
            contact = agent_handler._get_contact(phone)
            return contact.mark_as_read()
        msg_ids = await asyncio.to_thread(_mark)
        if msg_ids:
            asyncio.create_task(_send_read_receipts(phone, msg_ids))
        return _ok({"message": "Marcado como lido."})

    @app.post("/api/contacts/{phone}/toggle-ai")
    async def toggle_contact_ai(phone: str, body: dict):
        """Enable or disable AI auto-reply for a specific contact."""
        enabled = body.get("enabled")
        if enabled is None:
            return _err("Campo 'enabled' é obrigatório.")
        def _toggle():
            contact = agent_handler._get_contact(phone)
            contact.set_ai_enabled(bool(enabled))
            return contact.ai_enabled
        result = await asyncio.to_thread(_toggle)
        await ws_manager.broadcast("contact_ai_toggled", {
            "phone": phone,
            "ai_enabled": result,
        })
        return _ok({"ai_enabled": result})

    @app.get("/api/contacts/{phone}/avatar")
    async def get_contact_avatar(phone: str):
        """Return contact's WhatsApp profile photo (cached on disk)."""
        avatars_dir = statics_senditems_dir.parent / "avatars"
        avatars_dir.mkdir(parents=True, exist_ok=True)
        avatar_path = avatars_dir / f"{phone}.jpg"

        if avatar_path.exists():
            return FileResponse(str(avatar_path), media_type="image/jpeg")

        # Fetch from GOWA on-demand
        try:
            data = await asyncio.to_thread(gowa_client.get_avatar, phone)
        except Exception:
            data = None

        if data and isinstance(data, bytes):
            avatar_path.write_bytes(data)
            return FileResponse(str(avatar_path), media_type="image/jpeg")

        return Response(status_code=204)

    @app.put("/api/contacts/{phone}/info")
    async def update_contact_info(phone: str, body: dict):
        """Update contact info fields (name, email, profession, company, observations)."""
        def _update():
            contact = agent_handler._get_contact(phone)
            # Update scalar fields via update_info
            contact.update_info(
                name=body.get("name", ""),
                email=body.get("email", ""),
                profession=body.get("profession", ""),
                company=body.get("company", ""),
            )
            # Observations: replace entire list (update_info only appends)
            if "observations" in body:
                new_obs = [
                    o for o in body["observations"] if isinstance(o, str) and o.strip()
                ]
                contact.info["observations"] = new_obs
                contact_repo.set_observations(contact.id, new_obs)
            return contact.info
        info = await asyncio.to_thread(_update)
        return _ok(info)
