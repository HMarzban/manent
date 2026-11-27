// The left panel's Cuts list: newest cuts first, filterable by text or scene heading, with Restore on each row.
import type { BlockJSON } from "@manent/schema";
import {
  Button,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  MATERIAL_WORDS,
  Row,
  SurfaceState,
  VirtualRows,
  matchesQuery,
} from "@manent/ui";
import { ScissorsIcon, SearchIcon, XIcon } from "lucide-react";
import {
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { EmptyHeroCard } from "../../empty-hero-card.tsx";
import { liveEditor, livePagination } from "../../editor-host/live-editor.ts";
import { panelRenderers } from "../../screens/document/panel-surface.tsx";
import { OutlineContext } from "../../state/bridge-contexts.ts";
import { useMaterialCuts } from "../../state/material.store.ts";
import {
  blockText,
  cutFirstLine,
  cutSceneHeading,
  headingsMap,
} from "./script-cuts.ts";

interface SceneHeadingRow {
  blockId: string;
  kind: string;
  heading: string;
}

const READY = Object.freeze({ kind: "ready" });
const EMPTY = Object.freeze({ kind: "empty" });
const NO_BLOCKS: readonly BlockJSON[] = Object.freeze([]);
const NO_ROWS: readonly SceneHeadingRow[] = Object.freeze([]);
const SCENE_HEADINGS: ReadonlySet<string> = new Set([
  "scene_heading",
  "slug",
  "chapter",
]);

function sceneHeadingBlock(id: string, kind: string, text: string): BlockJSON {
  return {
    type: "block",
    attrs: { id, type: kind },
    content: text === "" ? [] : [{ type: "text", text }],
  };
}

function readLiveSceneBlocks(docId: string): readonly BlockJSON[] {
  const pmDoc = liveEditor(docId)?.view.state.doc;
  if (pmDoc !== undefined) {
    const blocks: BlockJSON[] = [];
    pmDoc.descendants((node) => {
      if (node.type.name !== "block") return true;
      const id = typeof node.attrs.id === "string" ? node.attrs.id : "";
      const kind = typeof node.attrs.type === "string" ? node.attrs.type : "";
      if (id !== "" && SCENE_HEADINGS.has(kind))
        blocks.push(sceneHeadingBlock(id, kind, node.textContent));
      return false;
    });
    return blocks;
  }
  const pagination = livePagination(docId);
  if (pagination === null) return NO_BLOCKS;
  const blocks: BlockJSON[] = [];
  for (const block of pagination.blocks) {
    if (!SCENE_HEADINGS.has(block.type)) continue;
    blocks.push(sceneHeadingBlock(block.id, block.type, block.text));
  }
  return blocks;
}

function useOutlineRows(): readonly SceneHeadingRow[] {
  const outline = useContext(OutlineContext);
  const subscribe = useCallback(
    (listener: () => void) => outline?.subscribe(listener) ?? (() => {}),
    [outline],
  );
  const cached = useRef<readonly SceneHeadingRow[]>(NO_ROWS);
  const read = (): readonly SceneHeadingRow[] => {
    if (outline === null) return NO_ROWS;
    const rows: SceneHeadingRow[] = [];
    for (let i = 0; i < outline.count(); i++) {
      const row = outline.row(i);
      if (row !== null && row.kind === "scene")
        rows.push({
          blockId: row.blockId,
          kind: row.kind,
          heading: row.heading,
        });
    }
    const before = cached.current;
    if (
      before.length !== rows.length ||
      before.some(
        (row, at) =>
          row.blockId !== rows[at]?.blockId ||
          row.heading !== rows[at]?.heading,
      )
    )
      cached.current = rows;
    return cached.current;
  };
  return useSyncExternalStore(subscribe, read, read);
}

function metaOf(sceneHeading: string | null, count: number): string {
  if (sceneHeading === null) return MATERIAL_WORDS.cutMetaBeforeFirst(count);
  if (sceneHeading === "") return MATERIAL_WORDS.elementCount(count);
  return MATERIAL_WORDS.cutMeta(sceneHeading, count);
}

/** A script's cuts list with filter and per-row Restore. */
export function CutsList(props: { docId: string }): ReactNode {
  const { docId } = props;
  const cuts = useMaterialCuts(docId);
  const outlineRows = useOutlineRows();
  const [filter, setFilter] = useState("");

  const liveBlocks = useMemo(
    () =>
      cuts.length === 0 || outlineRows.length > 0
        ? NO_BLOCKS
        : readLiveSceneBlocks(docId),
    [docId, cuts.length, outlineRows.length],
  );

  const headings = useMemo(
    () => headingsMap(liveBlocks, outlineRows, cuts),
    [liveBlocks, outlineRows, cuts],
  );

  const rows = useMemo(
    () =>
      cuts.map((cut) => {
        const firstLine = cutFirstLine(cut);
        const sceneHeading = cutSceneHeading(cut, headings);
        const searchTexts = [
          ...cut.blocks.map(blockText),
          ...(sceneHeading === null
            ? [MATERIAL_WORDS.beforeFirstScene]
            : sceneHeading === ""
              ? []
              : [sceneHeading]),
        ];
        return {
          id: cut.id,
          firstLine,
          meta: metaOf(sceneHeading, cut.blocks.length),
          count: cut.blocks.length,
          searchTexts,
        };
      }),
    [cuts, headings],
  );

  const filtered = useMemo(
    () =>
      filter === ""
        ? rows
        : rows.filter((row) => matchesQuery(filter, row.searchTexts)),
    [rows, filter],
  );

  const onRestore = (cutId: string): void => {
    void import("../../editor-host/material.ts").then(({ restoreCutIn }) =>
      restoreCutIn(docId, cutId),
    );
  };

  const filterRef = useRef<HTMLInputElement>(null);

  return (
    <SurfaceState
      surface="left_panel"
      state={cuts.length === 0 ? EMPTY : READY}
      render={panelRenderers({
        ready: () => (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex flex-col gap-1 p-2">
              <InputGroup className="h-control">
                <InputGroupAddon align="inline-start">
                  <SearchIcon aria-hidden="true" className="size-icon" />
                </InputGroupAddon>
                <InputGroupInput
                  ref={filterRef}
                  type="search"
                  aria-label={MATERIAL_WORDS.filter}
                  placeholder={MATERIAL_WORDS.filter}
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Escape" || filter === "") return;
                    event.preventDefault();
                    setFilter("");
                  }}
                />
                {filter === "" ? null : (
                  <InputGroupAddon align="inline-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={MATERIAL_WORDS.clearFilter}
                      className="size-6 cursor-pointer text-fg-muted hover:text-fg"
                      onClick={() => {
                        setFilter("");
                        filterRef.current?.focus();
                      }}
                    >
                      <XIcon aria-hidden="true" className="size-3.5" />
                    </Button>
                  </InputGroupAddon>
                )}
              </InputGroup>
              {filter !== "" ? (
                <p
                  role="status"
                  aria-live="polite"
                  className="px-1 text-micro text-fg-muted tabular-nums"
                >
                  {MATERIAL_WORDS.cutsMatchCount(filtered.length, rows.length)}
                </p>
              ) : null}
            </div>
            <div className="min-h-0 flex-1">
              {filtered.length === 0 ? (
                <div className="flex h-full items-center justify-center p-4">
                  <EmptyHeroCard
                    compact
                    icon={
                      <ScissorsIcon aria-hidden="true" className="size-4" />
                    }
                    description={MATERIAL_WORDS.cutsNoMatches}
                    actions={
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setFilter("");
                          filterRef.current?.focus();
                        }}
                      >
                        {MATERIAL_WORDS.clearFilter}
                      </Button>
                    }
                  />
                </div>
              ) : (
                <VirtualRows
                  count={filtered.length}
                  rowHeight="two"
                  label={MATERIAL_WORDS.cuts}
                  renderRow={(index) => {
                    const row = filtered[index];
                    if (row === undefined) return null;
                    return (
                      <Row
                        meta={<span title={row.meta}>{row.meta}</span>}
                        trailing={[
                          <Button
                            key="restore"
                            variant="outline"
                            size="sm"
                            aria-label={MATERIAL_WORDS.restoreName(
                              row.firstLine,
                            )}
                            onClick={() => onRestore(row.id)}
                          >
                            {MATERIAL_WORDS.restore}
                          </Button>,
                        ]}
                      >
                        <span title={row.firstLine}>{row.firstLine}</span>
                      </Row>
                    );
                  }}
                />
              )}
            </div>
          </div>
        ),
        empty: () => (
          <div className="flex h-full items-center justify-center p-4">
            <EmptyHeroCard
              compact
              icon={<ScissorsIcon aria-hidden="true" className="size-4" />}
              description={MATERIAL_WORDS.cutsEmpty}
            />
          </div>
        ),
      })}
    />
  );
}
