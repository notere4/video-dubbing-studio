import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { PageHeader } from "@/client/components/PageHeader";
import { StatusBadge } from "@/client/components/StatusBadge";
import { LanguageTrack } from "@/client/components/editor/LanguageTrack";
import { SourceSubtitles } from "@/client/components/editor/SourceSubtitles";
import { Alert, AlertDescription, AlertTitle } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Progress } from "@/client/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/client/components/ui/tabs";
import { languageName, PROJECT_STATUS_LABELS } from "@/lib/languages";
import { formatDuration } from "@/lib/subtitles";
import { getProjectDetail, startProcessing } from "@/serverFunctions/projects";

export const Route = createFileRoute("/projects/$id")({
  loader: ({ params }) => getProjectDetail({ data: { id: params.id } }),
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.project.name ?? "Project"} · Video Dubbing Studio` }],
  }),
  notFoundComponent: () => (
    <AppShell nav={<AppNav />}>
      <PageHeader title="Project not found" backLink={<BackToProjects />} />
    </AppShell>
  ),
  component: ProjectPage,
});

export type ProjectDetail = Awaited<ReturnType<typeof getProjectDetail>>;

function BackToProjects() {
  return (
    <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
      <ChevronLeft className="size-4" aria-hidden />
      Projects
    </Link>
  );
}

const BUSY = ["transcribing", "translating", "dubbing"];

function ProjectPage() {
  const detail = Route.useLoaderData();
  const { project, tracks } = detail;
  const router = useRouter();
  const [lang, setLang] = useState(project.targetLangs[0]!);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const mediaRef = useRef<HTMLMediaElement>(null);

  const busy =
    BUSY.includes(project.status) || tracks.some((t) => t.status === "translating" || t.status === "dubbing");
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => void router.invalidate(), 2000);
    return () => clearInterval(timer);
  }, [busy, router]);

  async function retry() {
    setRetrying(true);
    setRetryError(null);
    try {
      await startProcessing({ data: { id: project.id } });
      await router.invalidate();
    } catch (cause) {
      setRetryError(cause instanceof Error ? cause.message : "That didn't work.");
    } finally {
      setRetrying(false);
    }
  }

  const source = project.sourceLang === "auto" ? project.detectedLang : project.sourceLang;
  const hasSegments = detail.segments.length > 0;
  const processing = project.status === "transcribing" || (project.status === "translating" && !hasSegments);

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        backLink={<BackToProjects />}
        title={project.name}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              {languageName(source ?? "auto")} → {project.targetLangs.map(languageName).join(", ")}
            </span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">{formatDuration(project.durationSec)}</span>
            <StatusBadge status={project.status} />
          </span>
        }
      />

      {project.status === "failed" && (
        <Alert variant="destructive" data-testid="project-error">
          <AlertTitle>Processing stopped</AlertTitle>
          <AlertDescription>
            <p>{project.error ?? "Something went wrong."}</p>
            <Button className="mt-2" variant="outline" size="sm" data-testid="retry" pending={retrying} onClick={() => void retry()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {project.status === "uploaded" && (
        <Alert>
          <AlertTitle>{project.mediaUploaded ? "Not started" : "The upload didn't finish"}</AlertTitle>
          <AlertDescription>
            {project.mediaUploaded ? (
              <Button className="mt-2" size="sm" data-testid="retry" pending={retrying} onClick={() => void retry()}>
                Start
              </Button>
            ) : (
              "Delete this project and create it again."
            )}
          </AlertDescription>
        </Alert>
      )}
      {retryError && (
        <Alert variant="destructive">
          <AlertDescription>{retryError}</AlertDescription>
        </Alert>
      )}
      {(processing || (project.status === "translating" && hasSegments && !tracks.some((t) => t.status === "translating"))) && (
        <div className="space-y-2" data-testid="project-progress">
          <div className="flex justify-between text-sm">
            <span>{PROJECT_STATUS_LABELS[project.status]}…</span>
            <span className="tabular-nums text-muted-foreground">{project.progress}%</span>
          </div>
          <Progress value={project.progress} aria-label="Progress" />
        </div>
      )}

      <div className="space-y-4">
        {project.mediaType.startsWith("audio/") ? (
          <audio
            ref={(element) => {
              mediaRef.current = element;
            }}
            data-testid="preview-video"
            src={`/api/projects/${project.id}/media`}
            controls
            preload="auto"
            className="w-full"
          />
        ) : (
          <video
            ref={(element) => {
              mediaRef.current = element;
            }}
            data-testid="preview-video"
            src={`/api/projects/${project.id}/media`}
            controls
            preload="auto"
            playsInline
            className="aspect-video w-full rounded-xl border border-border bg-muted"
          />
        )}
        {hasSegments && <SourceSubtitles projectId={project.id} disabled={!["ready", "done"].includes(project.status)} />}
      </div>

      {hasSegments && project.targetLangs.length > 1 && (
        <Tabs value={lang} onValueChange={(value) => setLang(value as string)}>
          <TabsList>
            {project.targetLangs.map((code) => (
              <TabsTrigger key={code} value={code}>
                {languageName(code)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
      {hasSegments && <LanguageTrack key={lang} detail={detail} lang={lang} videoRef={mediaRef} />}
    </AppShell>
  );
}
