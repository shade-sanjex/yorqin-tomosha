import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ShieldAlert, Trash2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { uz } from "@/lib/uz";

interface StorageFile {
  name: string;
  size: number;
  updated_at?: string | null;
}

const BUCKET = "watch_party_media";

function fmtSize(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Recursively list all files in the bucket (storage.list is not recursive
 * by default — files live in user_id/... folders).
 */
async function listAllFiles(prefix = ""): Promise<{ path: string; size: number; updated_at?: string | null }[]> {
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
    limit: 1000,
    sortBy: { column: "updated_at", order: "desc" },
  });
  if (error || !data) return [];
  const files: { path: string; size: number; updated_at?: string | null }[] = [];
  for (const item of data) {
    const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
    // Folders have no id and metadata is null
    if (item.id === null || item.metadata === null) {
      const sub = await listAllFiles(fullPath);
      files.push(...sub);
    } else {
      files.push({
        path: fullPath,
        size: (item.metadata as { size?: number })?.size ?? 0,
        updated_at: item.updated_at ?? null,
      });
    }
  }
  return files;
}

export function ServerMediaManager() {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<{ path: string; size: number; updated_at?: string | null }[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const all = await listAllFiles("");
    setFiles(all);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const deleteOne = async (path: string) => {
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    if (error) {
      toast.error(uz.unknownError);
      return;
    }
    setFiles((prev) => prev.filter((f) => f.path !== path));
    toast.success(uz.fileDeleted);
  };

  const deleteAll = async () => {
    if (files.length === 0) return;
    const paths = files.map((f) => f.path);
    const { error } = await supabase.storage.from(BUCKET).remove(paths);
    setConfirmAll(false);
    if (error) {
      toast.error(uz.unknownError);
      return;
    }
    setFiles([]);
    toast.success(uz.allFilesDeleted);
  };

  const totalSize = files.reduce((s, f) => s + f.size, 0);

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="border-primary/50 text-primary hover:bg-primary/10">
            <ShieldAlert className="size-4 mr-1.5" />
            {uz.manageServer}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-primary" />
              {uz.manageServer}
            </DialogTitle>
            <DialogDescription>
              {uz.serverFiles} — {files.length} ta · {fmtSize(totalSize)}
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={files.length === 0 || loading}
              onClick={() => setConfirmAll(true)}
              className="ml-auto"
            >
              <Trash2 className="size-4 mr-1.5" />
              {uz.deleteAll}
            </Button>
          </div>

          <div className="max-h-[50vh] overflow-y-auto rounded-md border bg-surface-2">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                <Loader2 className="size-5 animate-spin mx-auto mb-2" />
                {uz.loadingFiles}
              </div>
            ) : files.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">{uz.noFiles}</div>
            ) : (
              <ul className="divide-y">
                {files.map((f) => (
                  <li key={f.path} className="flex items-center gap-3 p-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-xs truncate">{f.path}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {fmtSize(f.size)}
                        {f.updated_at ? ` · ${new Date(f.updated_at).toLocaleString("uz-UZ")}` : ""}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteOne(f.path)}
                      aria-label={uz.delete}
                    >
                      <Trash2 className="size-3.5 mr-1" />
                      {uz.delete}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmAll} onOpenChange={setConfirmAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{uz.deleteAll}</AlertDialogTitle>
            <AlertDialogDescription>{uz.deleteAllConfirm}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{uz.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={deleteAll}
            >
              {uz.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
