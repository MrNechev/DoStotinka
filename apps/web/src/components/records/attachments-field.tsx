import type { Attachment } from '@slavotax/shared';
import { FileText, Loader2, Paperclip, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import { useAttachments, useDeleteAttachment, useUploadAttachments } from '@/api/queries';
import { useConfirm } from '@/components/ui/confirm';
import { t } from '@/i18n';
import { ACCEPT_ATTRIBUTE, attachmentUrl, fileSize } from '@/lib/attachments';
import { cn } from '@/lib/utils';

const MAX_FILES = 10;

const tile =
  'group relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/60';

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="absolute top-0.5 right-0.5 flex size-5 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white opacity-90 hover:bg-black/80 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
    >
      <X className="size-3" strokeWidth={3} />
    </button>
  );
}

function PendingTile({ file, onRemove }: { file: File; onRemove: () => void }) {
  // Created in an effect (not a memo) so the URL is revoked exactly once per creation.
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file.type.startsWith('image/')) return;
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return (
    <div className={tile} title={`${file.name} · ${fileSize(file.size)}`}>
      {url ? (
        <img src={url} alt={file.name} className="size-full object-cover" />
      ) : (
        <FileText className="size-6 text-muted-foreground" />
      )}
      <RemoveButton label={t('Remove {name}', { name: file.name })} onClick={onRemove} />
    </div>
  );
}

function StoredTile({ attachment, onRemove }: { attachment: Attachment; onRemove: () => void }) {
  const isImage = attachment.contentType.startsWith('image/');
  return (
    <div className={tile}>
      <a
        href={attachmentUrl(attachment.id)}
        target="_blank"
        rel="noopener"
        title={`${attachment.fileName} · ${fileSize(attachment.size)}`}
        className="flex size-full items-center justify-center"
      >
        {isImage ? (
          <img
            src={attachmentUrl(attachment.id)}
            alt={attachment.fileName}
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <span className="flex flex-col items-center gap-0.5 px-1 text-muted-foreground">
            <FileText className="size-5" />
            <span className="w-full truncate text-[9px] font-medium">PDF</span>
          </span>
        )}
      </a>
      <RemoveButton label={t('Delete {name}', { name: attachment.fileName })} onClick={onRemove} />
    </div>
  );
}

/**
 * Receipts and other files of a record. For a saved record files are uploaded right away; for a new
 * record they are kept in `pending` and uploaded by the editor after saving.
 */
export function AttachmentsField({
  recordId,
  pending,
  onPendingChange,
}: {
  recordId?: string;
  pending: File[];
  onPendingChange: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: stored = [], isLoading } = useAttachments(recordId);
  const upload = useUploadAttachments();
  const remove = useDeleteAttachment();
  const confirm = useConfirm();
  const count =
    stored.length + pending.length + (upload.isPending ? upload.variables.files.length : 0);

  const onPick = async (list: FileList | null) => {
    const files = [...(list ?? [])].slice(0, Math.max(0, MAX_FILES - count));
    if (inputRef.current) inputRef.current.value = '';
    if (!files.length) {
      if (list?.length) toast.error(t('A record can have at most 10 attachments'));
      return;
    }
    if (!recordId) {
      onPendingChange([...pending, ...files]);
      return;
    }
    try {
      await upload.mutateAsync({ recordId, files });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const onDelete = async (attachment: Attachment) => {
    const ok = await confirm({
      title: t('Delete this attachment?'),
      description: attachment.fileName,
      confirmLabel: t('Delete'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(attachment);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {stored.map((a) => (
        <StoredTile key={a.id} attachment={a} onRemove={() => void onDelete(a)} />
      ))}
      {pending.map((file, i) => (
        <PendingTile
          key={`${file.name}-${i}`}
          file={file}
          onRemove={() => onPendingChange(pending.filter((_, j) => j !== i))}
        />
      ))}
      {(upload.isPending || (isLoading && !!recordId)) && (
        <div className={tile}>
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {count < MAX_FILES && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={cn(
            tile,
            'cursor-pointer flex-col gap-0.5 border-dashed bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <Paperclip className="size-4" />
          <span className="text-[10px] font-medium">{t('Add file')}</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        multiple
        hidden
        onChange={(e) => void onPick(e.target.files)}
      />
    </div>
  );
}
