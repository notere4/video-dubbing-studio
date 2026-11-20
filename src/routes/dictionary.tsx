import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { SimpleSelect } from "@/client/components/SimpleSelect";
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
import {
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { LANGUAGES, languageName } from "@/lib/languages";
import { createTerm, deleteTerm, getTerms, updateTerm } from "@/serverFunctions/terms";

export const Route = createFileRoute("/dictionary")({
  loader: () => getTerms(),
  head: () => ({ meta: [{ title: "Dictionary · Video Dubbing Studio" }] }),
  component: Dictionary,
});

const LANG_ITEMS = Object.entries(LANGUAGES).map(([value, label]) => ({ value, label }));

interface Draft {
  id?: string;
  source: string;
  lang: string;
  translation: string;
  keepAsIs: boolean;
}
const EMPTY: Draft = { source: "", lang: "", translation: "", keepAsIs: false };

function TermFields({ draft, onChange, prefix }: { draft: Draft; onChange: (d: Draft) => void; prefix: string }) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={`${prefix}-source`}>Term</Label>
        <Input
          id={`${prefix}-source`}
          data-testid={prefix === "term" ? "term-source" : "edit-term-source"}
          value={draft.source}
          maxLength={200}
          onChange={(e) => onChange({ ...draft, source: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Language</Label>
        <SimpleSelect
          items={LANG_ITEMS}
          value={draft.lang}
          onChange={(lang) => onChange({ ...draft, lang })}
          label="Language"
          testId={prefix === "term" ? "term-lang" : "edit-term-lang"}
          className="w-full"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${prefix}-translation`}>Translation</Label>
        <Input
          id={`${prefix}-translation`}
          data-testid={prefix === "term" ? "term-translation" : "edit-term-translation"}
          value={draft.keepAsIs ? "" : draft.translation}
          disabled={draft.keepAsIs}
          maxLength={200}
          onChange={(e) => onChange({ ...draft, translation: e.target.value })}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          data-testid={prefix === "term" ? "term-keep" : "edit-term-keep"}
          checked={draft.keepAsIs}
          onCheckedChange={(checked) => onChange({ ...draft, keepAsIs: !!checked })}
        />
        Keep as is
      </label>
    </>
  );
}

function payload(draft: Draft) {
  return {
    source: draft.source.trim(),
    lang: draft.lang,
    translation: draft.keepAsIs ? null : draft.translation.trim() || null,
    keepAsIs: draft.keepAsIs,
  };
}

function Dictionary() {
  const terms = Route.useLoaderData();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; source: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function run(work: () => Promise<unknown>, done: () => void) {
    setPending(true);
    try {
      await work();
      await router.invalidate();
      done();
    } catch (cause) {
      toast.error(readable(cause));
    } finally {
      setPending(false);
    }
  }

  function check(d: Draft) {
    if (!d.source.trim()) return "Enter a term.";
    if (!d.lang) return "Pick a language.";
    if (!d.keepAsIs && !d.translation.trim()) return "Enter the approved translation or keep the term as is.";
    return null;
  }

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        title="Dictionary"
        description="New translations always use these words."
      />
      <form
        className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const problem = check(draft);
          if (problem) return void toast.error(problem);
          void run(() => createTerm({ data: payload(draft) }), () => setDraft({ ...EMPTY, lang: draft.lang }));
        }}
      >
        <TermFields draft={draft} onChange={setDraft} prefix="term" />
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" data-testid="add-term" pending={pending && !editing && !deleting}>
            Add term
          </Button>
        </div>
      </form>

      {terms.length === 0 ? (
        <EmptyState title="No terms yet" description="Add names, brands and jargon with the wording they should always get." />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Term</TableHead>
                <TableHead>Language</TableHead>
                <TableHead>Translation</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {terms.map((term) => (
                <TableRow key={term.id} data-testid="term-row">
                  <TableCell className="font-medium">{term.source}</TableCell>
                  <TableCell className="text-muted-foreground">{languageName(term.lang)}</TableCell>
                  <TableCell>{term.keepAsIs ? <span className="text-muted-foreground">Keep as is</span> : term.translation}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${term.source}`}
                      data-testid="term-edit"
                      onClick={() =>
                        setEditing({ id: term.id, source: term.source, lang: term.lang, translation: term.translation ?? "", keepAsIs: term.keepAsIs })
                      }
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${term.source}`}
                      data-testid="term-delete"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleting({ id: term.id, source: term.source })}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit term</DialogTitle>
          </DialogHeader>
          {editing && (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                const problem = check(editing);
                if (problem) return void toast.error(problem);
                void run(() => updateTerm({ data: { id: editing.id!, ...payload(editing) } }), () => setEditing(null));
              }}
            >
              <TermFields draft={editing} onChange={setEditing} prefix="edit-term" />
              <DialogFooter>
                <Button type="submit" data-testid="save-term" pending={pending}>
                  Save
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {deleting && (
        <ConfirmDialog
          title={`Delete “${deleting.source}”?`}
          confirmLabel="Delete"
          destructive
          pending={pending}
          onClose={() => setDeleting(null)}
          onConfirm={() => void run(() => deleteTerm({ data: { id: deleting.id } }), () => setDeleting(null))}
        />
      )}
    </AppShell>
  );
}

function readable(cause: unknown) {
  if (!(cause instanceof Error)) return "That didn't work.";
  try {
    const issues = JSON.parse(cause.message) as { message: string }[];
    if (Array.isArray(issues) && issues[0]?.message) return issues[0].message;
  } catch {
    // not a validation error
  }
  return cause.message;
}
