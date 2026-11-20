import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { NewProjectDialog } from "@/client/components/NewProjectDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { RowActionsMenu } from "@/client/components/RowActionsMenu";
import { StatusBadge } from "@/client/components/StatusBadge";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { DropdownMenuItem } from "@/client/components/ui/dropdown-menu";
import { Input } from "@/client/components/ui/input";
import {
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { languageName } from "@/lib/languages";
import { formatDuration } from "@/lib/subtitles";
import { deleteProject, getProjects, renameProject } from "@/serverFunctions/projects";

export const Route = createFileRoute("/")({
  loader: () => getProjects(),
  head: () => ({ meta: [{ title: "Projects · Video Dubbing Studio" }] }),
  component: Projects,
});

const BUSY = ["transcribing", "translating", "dubbing"];

function Projects() {
  const projects = Route.useLoaderData();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const [pending, setPending] = useState(false);

  const busy = projects.some((p) => BUSY.includes(p.status));
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => void router.invalidate(), 3000);
    return () => clearInterval(timer);
  }, [busy, router]);

  async function run(work: () => Promise<unknown>, done: () => void) {
    setPending(true);
    try {
      await work();
      await router.invalidate();
      done();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "That didn't work.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        title="Projects"
        actions={
          <Button data-testid="new-project" onClick={() => setCreating(true)}>
            <Plus data-icon="inline-start" />
            New project
          </Button>
        }
      />
      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Upload a video or audio file to transcribe, translate and dub it."
          action={<Button onClick={() => setCreating(true)}>New project</Button>}
        />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Languages</TableHead>
                <TableHead className="hidden sm:table-cell">Length</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Created</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => (
                <TableRow key={project.id} data-testid="project-row">
                  <TableCell className="max-w-48 truncate font-medium">
                    <Link to="/projects/$id" params={{ id: project.id }} className="hover:underline">
                      {project.name}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {languageName(project.sourceLang === "auto" ? (project.detectedLang ?? "auto") : project.sourceLang)} →{" "}
                    {project.targetLangs.map(languageName).join(", ")}
                  </TableCell>
                  <TableCell className="hidden tabular-nums text-muted-foreground sm:table-cell">
                    {formatDuration(project.durationSec)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={project.status} />
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {new Date(`${project.createdAt.replace(" ", "T")}Z`).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <RowActionsMenu label={`Actions for ${project.name}`} testId="project-actions">
                        <DropdownMenuItem onClick={() => setRenaming({ id: project.id, name: project.name })}>
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => setDeleting({ id: project.id, name: project.name })}>
                          Delete
                        </DropdownMenuItem>
                    </RowActionsMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}

      <NewProjectDialog open={creating} onOpenChange={setCreating} />

      <Dialog open={!!renaming} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!renaming?.name.trim()) return;
              void run(() => renameProject({ data: { id: renaming.id, name: renaming.name.trim() } }), () => setRenaming(null));
            }}
          >
            <Input
              aria-label="Name"
              data-testid="rename-input"
              value={renaming?.name ?? ""}
              maxLength={120}
              onChange={(e) => setRenaming((r) => (r ? { ...r, name: e.target.value } : r))}
            />
            <DialogFooter>
              <Button type="submit" data-testid="rename-save" pending={pending}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {deleting && (
        <ConfirmDialog
          title={`Delete “${deleting.name}”?`}
          confirmLabel="Delete"
          destructive
          pending={pending}
          onClose={() => setDeleting(null)}
          onConfirm={() => void run(() => deleteProject({ data: { id: deleting.id } }), () => setDeleting(null))}
        >
          The video, its translations and dubbed audio are deleted for good.
        </ConfirmDialog>
      )}
    </AppShell>
  );
}
