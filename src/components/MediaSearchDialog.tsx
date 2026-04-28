import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Film } from "lucide-react";
import { toast } from "sonner";
import { uz } from "@/lib/uz";

const CONSUMET_BASE = "https://api.consumet.org";

interface SearchResult {
  id: string;
  title: string;
  image: string;
  releaseDate?: string | null;
  type?: string | null;
}

interface AnimeApiResult {
  id: string;
  title: string | { romaji?: string; english?: string; native?: string };
  image: string;
  releaseDate?: string;
  type?: string;
}

interface MovieApiResult {
  id: string;
  title: string;
  image: string;
  releaseDate?: string;
  type?: string;
}

interface MediaSearchDialogProps {
  onPick: (url: string, title: string) => void;
}

export function MediaSearchDialog({ onPick }: MediaSearchDialogProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"anime" | "movies">("anime");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);

  const runSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResults([]);
    try {
      const url =
        tab === "anime"
          ? `${CONSUMET_BASE}/meta/anilist/${encodeURIComponent(query.trim())}`
          : `${CONSUMET_BASE}/movies/flixhq/${encodeURIComponent(query.trim())}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("api");
      const json = (await res.json()) as { results?: (AnimeApiResult | MovieApiResult)[] };
      const list = (json.results ?? []).slice(0, 20).map((r) => ({
        id: r.id,
        title:
          typeof r.title === "string"
            ? r.title
            : r.title?.english || r.title?.romaji || r.title?.native || "—",
        image: r.image,
        releaseDate: r.releaseDate ?? null,
        type: r.type ?? null,
      }));
      setResults(list);
      if (list.length === 0) toast.info(uz.noSearchResults);
    } catch {
      toast.error(uz.searchUnavailable);
    } finally {
      setLoading(false);
    }
  };

  const pick = async (item: SearchResult) => {
    setStreamingId(item.id);
    try {
      let watchUrl = "";
      if (tab === "anime") {
        // Get info first to find first episode id
        const info = await fetch(
          `${CONSUMET_BASE}/meta/anilist/info/${encodeURIComponent(item.id)}`
        ).then((r) => r.json() as Promise<{ episodes?: { id: string }[] }>);
        const epId = info.episodes?.[0]?.id;
        if (!epId) throw new Error("noep");
        watchUrl = `${CONSUMET_BASE}/meta/anilist/watch/${encodeURIComponent(epId)}`;
      } else {
        const info = await fetch(
          `${CONSUMET_BASE}/movies/flixhq/info?id=${encodeURIComponent(item.id)}`
        ).then((r) => r.json() as Promise<{ episodes?: { id: string }[] }>);
        const epId = info.episodes?.[0]?.id;
        if (!epId) throw new Error("noep");
        watchUrl = `${CONSUMET_BASE}/movies/flixhq/watch?episodeId=${encodeURIComponent(
          epId
        )}&mediaId=${encodeURIComponent(item.id)}`;
      }
      const res = await fetch(watchUrl);
      if (!res.ok) throw new Error("api");
      const data = (await res.json()) as { sources?: { url: string; isM3U8?: boolean }[] };
      const m3u8 = data.sources?.find((s) => s.isM3U8 || s.url.endsWith(".m3u8"));
      const url = m3u8?.url ?? data.sources?.[0]?.url;
      if (!url) throw new Error("nosrc");
      onPick(url, item.title);
      setOpen(false);
    } catch {
      toast.error(uz.streamUnavailable);
    } finally {
      setStreamingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Search className="size-3.5 mr-1.5" />
          <span className="hidden sm:inline">{uz.searchMedia}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{uz.searchMedia}</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => { setTab(v as "anime" | "movies"); setResults([]); }}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="anime">{uz.searchAnime}</TabsTrigger>
            <TabsTrigger value="movies">{uz.searchMovies}</TabsTrigger>
          </TabsList>
          <TabsContent value={tab} className="mt-3">
            <div className="flex gap-2">
              <Input
                placeholder={uz.searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
              />
              <Button onClick={runSearch} disabled={loading}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              </Button>
            </div>

            <div className="mt-4 max-h-[55vh] overflow-y-auto">
              {loading && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <Loader2 className="size-5 animate-spin mx-auto mb-2" /> {uz.searching}
                </div>
              )}
              {!loading && results.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <Film className="size-8 mx-auto mb-2 opacity-50" />
                  {uz.noSearchResults}
                </div>
              )}
              <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {results.map((r) => (
                  <li key={r.id} className="rounded-lg border bg-surface overflow-hidden flex flex-col">
                    {r.image && (
                      <img
                        src={r.image}
                        alt={r.title}
                        className="w-full aspect-[2/3] object-cover"
                        loading="lazy"
                      />
                    )}
                    <div className="p-2 flex-1 flex flex-col gap-1">
                      <p className="text-xs font-semibold line-clamp-2">{r.title}</p>
                      {r.releaseDate && (
                        <p className="text-[10px] text-muted-foreground">{r.releaseDate}</p>
                      )}
                      <Button
                        size="sm"
                        className="mt-auto"
                        onClick={() => pick(r)}
                        disabled={streamingId === r.id}
                      >
                        {streamingId === r.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          uz.loadStream
                        )}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
