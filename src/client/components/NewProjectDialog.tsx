import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { SimpleSelect } from "@/client/components/SimpleSelect";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Checkbox } from "@/client/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { speechAudio, speechChunks } from "@/client/lib/audio";
import { LANGUAGES } from "@/lib/languages";
import { createProject, startProcessing } from "@/serverFunctions/projects";

const SOURCE_ITEMS = [
  { value: "auto", label: "Auto-detect" },
  ...Object.entries(LANGUAGES).map(([value, label]) => ({ value, label })),
];

async function put(url: string, body: Blob) {
  const response = await fetch(url, { method: "PUT", body });
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(detail?.error ?? "The upload failed.");
  }
}

export function NewProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [source, setSource] = useState("auto");
  const [targets, setTargets] = useState<string[]>([]);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!file) return setError("Choose a video or audio file.");
    if (!name.trim()) return setError("Give the project a name.");
    if (targets.length === 0) return setError("Pick at least one language to translate into.");
    setError(null);
    try {
      setStep("Reading the audio…");
      const { duration, samples } = await speechAudio(file);
      setStep("Creating the project…");
      const chunkSeconds = 60;
      const chunks = speechChunks(samples, chunkSeconds);
      const created = await createProject({
        data: {
          name: name.trim(),
          sourceLang: source,
          targetLangs: targets,
          durationSec: Math.round(duration * 1000) / 1000,
          mediaType: file.type || "application/octet-stream",
          audioChunks: chunks.length,
        },
      });
      setStep("Uploading…");
      await put(`/api/projects/${created.id}/media`, file);
      for (const [i, chunk] of chunks.entries()) await put(`/api/projects/${created.id}/audio/${i}`, chunk);
      await startProcessing({ data: { id: created.id } });
      onOpenChange(false);
      await navigate({ to: "/projects/$id", params: { id: created.id } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't work.");
    } finally {
      setStep(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !step && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="project-file">Video or audio file</Label>
            <Input
              id="project-file"
              data-testid="project-file"
              type="file"
              accept="video/*,audio/*"
              onChange={(event) => {
                const next = event.target.files?.[0] ?? null;
                setFile(next);
                if (next && !name) setName(next.name.replace(/\.[^.]+$/, ""));
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="project-name">Name</Label>
            <Input id="project-name" data-testid="project-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Spoken language</Label>
            <SimpleSelect items={SOURCE_ITEMS} value={source} onChange={setSource} label="Spoken language" testId="source-lang" className="w-full" />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Translate into</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Object.entries(LANGUAGES)
                .filter(([code]) => code !== source)
                .map(([code, label]) => (
                  <label key={code} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      data-testid={`target-${code}`}
                      checked={targets.includes(code)}
                      onCheckedChange={(checked) =>
                        setTargets((current) => (checked ? [...current, code] : current.filter((c) => c !== code)))
                      }
                    />
                    {label}
                  </label>
                ))}
            </div>
          </fieldset>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="submit" data-testid="create-project" pending={!!step}>
              {step ?? "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
