'use client';
import { createContext, useContext, type ReactNode } from 'react';
export const AccountChecking = createContext(false);
import { ArrowUpRight, Disc3 } from 'lucide-react';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { MusicItem } from '@/lib/resonance/domain';
export function Choice({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: (string | [string, string])[];
}) {
  return (
    <NativeSelect
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => {
        const [v, l] = Array.isArray(o) ? o : [o, o];
        return (
          <option value={v} key={v}>
            {l}
          </option>
        );
      })}
    </NativeSelect>
  );
}
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const checking = useContext(AccountChecking);
  return (
    <Dialog
      open={open && !checking}
      onOpenChange={(v) => !v && !checking && onClose()}
    >
      <DialogContent className={`res-modal ${wide ? 'wide' : ''}`}>
        <DialogTitle className="modal-title">{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function Empty({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Disc3 size={38} strokeWidth={1} />
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function ProviderAction({
  item,
  compact = false,
}: {
  item: MusicItem;
  compact?: boolean;
}) {
  const link = item.links[0];
  return (
    <a
      className={`button ${compact ? 'quiet' : 'primary'}`}
      href={
        link?.url ||
        `https://open.spotify.com/search/${encodeURIComponent(`${item.title} ${item.artist}`)}`
      }
      target="_blank"
      rel="noopener noreferrer"
    >
      {link ? `Open in ${link.provider}` : 'Find on Spotify'}
      <ArrowUpRight size={16} />
    </a>
  );
}
export const dateLabel = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString(
    'en-GB',
    { day: 'numeric', month: 'short', year: 'numeric' },
  );
export const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export function download(
  name: string,
  text: string,
  type = 'application/json',
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
