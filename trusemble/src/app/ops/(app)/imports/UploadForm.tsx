'use client';
import { useState } from 'react';
import { useFormAction } from '@/components/useFormAction';
import { FileSpreadsheet } from 'lucide-react';
import { uploadImportAction, type ActionState } from '@/app/ops/actions';

export function UploadForm() {
  const [s, onSubmit, pending] = useFormAction(uploadImportAction, {} as ActionState);
  const [name, setName] = useState('');
  return (
    <form onSubmit={onSubmit} method="post" className="stack">
      {s.error && <div className="alert bad" role="alert">{s.error}</div>}
      <label htmlFor="file" className="empty" style={{ cursor: 'pointer', display: 'grid', gap: 8, justifyItems: 'center', padding: 28 }}>
        <FileSpreadsheet size={28} aria-hidden />
        <b>{name || 'Choose a CSV or Excel file'}</b>
        <span className="small">.csv or .xlsx, up to 10 MB. The original file is kept privately.</span>
        <input id="file" name="file" type="file" accept=".csv,.xlsx" className="sr-only" onChange={(e) => setName(e.target.files?.[0]?.name ?? '')} />
      </label>
      <button className="btn primary sm" style={{ justifySelf: 'start' }} disabled={!name || pending}>{pending ? 'Reading the file…' : 'Upload and map columns'}</button>
    </form>
  );
}
