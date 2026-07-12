import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import htm from 'htm';

const html = htm.bind(h);

const EMOJIS = [
  '😀','😂','😍','👍','👎','🎉','🔥','❤️','👏','🤔',
  '😅','😢','😡','👌','🤣','💪','🙏','👀','✨','😎',
  '🤗','🤩','😴','😇','🤯','🥳','😭','🙌','💯','🚀'
];

export function EmojiPicker({ visible, onClose, onSelect }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!visible) return;
    function onEsc(e) { if (e.key === 'Escape') onClose?.(); }
    function onClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose?.();
    }
    document.addEventListener('keydown', onEsc);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onEsc);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [visible, onClose]);

  if (!visible) return null;

  return html`
    <div ref=${panelRef} class="absolute bottom-[72px] left-[8px] z-50 w-[296px] max-h-[260px] bg-white border border-wa-border rounded-[12px] shadow-lg overflow-hidden">
      <div class="flex items-center justify-between px-[10px] py-[8px] border-b border-wa-border">
        <span class="text-[13px] font-medium text-wa-text">Emoticons</span>
        <button type="button" onClick=${onClose} class="text-wa-secondary hover:text-wa-text text-[12px]">Fechar</button>
      </div>
      <div class="p-[8px] grid grid-cols-8 gap-[6px] overflow-y-auto max-h-[220px]">
        ${EMOJIS.map(emoji => html`
          <button
            key=${emoji}
            type="button"
            class="text-[22px] leading-none hover:bg-wa-hover rounded-md p-[6px] transition-colors"
            onClick=${() => onSelect?.(emoji)}
          >${emoji}</button>
        `)}
      </div>
    </div>
  `;
}
