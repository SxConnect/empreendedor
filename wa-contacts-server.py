from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import sqlite3
from pathlib import Path

DB_PATH = Path('/home/silvano/Área de trabalho/Hermes Agent/dash-externo/whatsapp-painel/painel-whats-main/storages/whatsbot.db')

class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'content-type')
        self.send_header('Cache-Control', 'no-store')

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        try:
            if not DB_PATH.exists():
                self._json(200, {'ok': True, 'data': []})
                return
            q = ''
            if '?q=' in self.path:
                q = self.path.split('?q=')[1].split('&')[0]
            con = sqlite3.connect(str(DB_PATH))
            cur = con.cursor()
            if q:
                cur.execute('''
                    SELECT c.id, c.phone, c.name, c.ai_enabled, c.unread_count, c.is_group, c.group_name,
                           m.content, m.role, m.ts, m.status, m.msg_id, m.id
                    FROM contacts c
                    LEFT JOIN messages m ON m.contact_id = c.id
                    WHERE c.phone LIKE ? OR c.name LIKE ?
                    ORDER BY c.id, m.ts DESC
                ''', ('%' + q + '%', '%' + q + '%'))
            else:
                cur.execute('''
                    SELECT c.id, c.phone, c.name, c.ai_enabled, c.unread_count, c.is_group, c.group_name,
                           m.content, m.role, m.ts, m.status, m.msg_id, m.id
                    FROM contacts c
                    LEFT JOIN messages m ON m.contact_id = c.id
                    ORDER BY c.id, m.ts DESC
                ''')
            rows = cur.fetchall()
            con.close()

            contacts_map = {}
            for row in rows:
                cid, phone, name, ai_enabled, unread_count, is_group, group_name, content, role, ts, status, msg_id, msg_id_row = row
                contact = contacts_map.setdefault(cid, {
                    'id': cid,
                    'phone': phone or '',
                    'name': (name or '').strip(),
                    'group_name': (group_name or '').strip(),
                    'ai_enabled': bool(ai_enabled),
                    'is_group': bool(is_group),
                    'unread_count': unread_count or 0,
                    'msg_count': 0,
                    'messages': [],
                })
                if ts is None:
                    continue
                contact['messages'].append({
                    'role': role or '',
                    'content': content or '',
                    'ts': float(ts),
                    'status': status,
                    'msg_id': msg_id or '',
                    'message_id': msg_id_row,
                })

            data = []
            for cid, c in sorted(contacts_map.items(), key=lambda x: x[0]):
                msgs = sorted(c['messages'], key=lambda x: x.get('ts') or 0, reverse=True)
                last = msgs[0] if msgs else None
                c['last_message'] = last['content'] if last else ''
                c['last_message_role'] = last['role'] if last else ''
                c['last_message_ts'] = last['ts'] if last else 0
                c['last_message_status'] = last['status'] if last else ''
                c['last_message_msg_id'] = last['msg_id'] if last else ''
                c['last_message_id'] = last['message_id'] if last else ''
                c['msg_count'] = len(msgs)
                del c['messages']
                data.append(c)

            data.sort(key=lambda x: x.get('last_message_ts') or 0, reverse=True)
            self._json(200, {'ok': True, 'data': data})
        except Exception as e:
            self._json(500, {'ok': False, 'error': str(e)})

    def _json(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('content-type', 'application/json')
        self._cors()
        self.end_headers()
        self.wfile.write(body)

def main():
    HTTPServer(('127.0.0.1', 9002), Handler).serve_forever()

if __name__ == '__main__':
    main()
