'use client';

import { useState } from 'react';
import { useToast } from '@/components/ui';
import { encodeImage } from '@/components/shell/uploadImage';
import { api } from '@/lib/client/api';
import type { MgPerson } from '@/lib/mg';
import { Av } from './ui';
import type { Mg } from './store';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';
const CAM = '<path d="M4 8h3l2-3h6l2 3h3v11H4z"></path><circle cx="12" cy="13" r="3.5"></circle>';
const X = '<line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line>';
const Ic = ({ d }: { d: string }) => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    dangerouslySetInnerHTML={{ __html: d }}
  />
);

/** Recursos › the person's avatar: initials or photo, with upload and remove. */
export function PersonPhoto({
  mg,
  p,
  size,
  fs,
  tc,
}: {
  mg: Mg;
  p: MgPerson;
  size: number;
  fs: number;
  tc?: string;
}) {
  const { tr } = mg;
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const setPhoto = (v: string) =>
    mg.local((d) => {
      const x = d.people.find((y) => y.id === p.id);
      if (x) x.photo = v;
    });
  const fail = () => toast({ message: tr('Não foi possível guardar a foto.'), tone: 'error' });

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const body = await encodeImage('avatar', file);
      const res = await fetch(`${BASE}/api/v1/mg/people/${p.id}/photo`, {
        method: 'PUT',
        headers: { 'Content-Type': body.type },
        body,
        credentials: 'same-origin',
      });
      const data = (await res.json().catch(() => ({}))) as { photo?: string };
      if (!res.ok || !data.photo) throw new Error('upload');
      setPhoto(data.photo);
    } catch {
      fail();
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api(`/mg/people/${p.id}/photo`, undefined, 'DELETE');
      setPhoto('');
    } catch {
      fail();
    } finally {
      setBusy(false);
    }
  };

  const up = p.photo ? tr('Mudar foto') : tr('Carregar foto');
  return (
    <span className="mg-photo" aria-busy={busy || undefined}>
      <Av p={p} size={size} fs={fs} tc={tc} />
      <label className="mg-photo__btn mg-photo__up" title={up}>
        <Ic d={CAM} />
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label={up}
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void upload(f);
          }}
        />
      </label>
      {p.photo && (
        <button
          type="button"
          className="mg-photo__btn mg-photo__rm"
          title={tr('Remover foto')}
          aria-label={tr('Remover foto')}
          disabled={busy}
          onClick={() => void remove()}
        >
          <Ic d={X} />
        </button>
      )}
    </span>
  );
}
