import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
} from "react";
import {
  GAMES,
  EMPTY_LIBRARY_FILTERS,
  matchesLibraryFilters,
  type GameManifest,
  type HostState,
  type HostCommand,
} from "../shared/types";
import type { ArtworkSlot } from "../shared/studio-model";
import type { PresentationState } from "../shared/presentation";
import { Icon } from "./ui";
import { LibraryCardMenu, type CardMenuAnchor } from "./library-card-menu";
import { useDiscMotion } from "./disc-motion";
import "./collection.css";
export type CollectionArtworkProps = {
  gameId: string;
  art?: ArtworkSlot;
  variant: "cover" | "hero";
  alt?: string;
};
export function visibleCollectionGames(state: HostState) {
  return (state.catalog || GAMES).filter(
    (game) =>
      [game.title, game.subtitle, game.description, ...(game.tags || [])]
        .join(" ")
        .toLowerCase()
        .includes(state.search.toLowerCase()) &&
      matchesLibraryFilters(game, state.libraryFilters) &&
      (state.libraryView === "favorites"
        ? state.favorites.includes(game.id)
        : state.libraryView === "recent"
          ? state.recent.includes(game.id)
          : true),
  );
}
export function VoyagerCollection({
  state,
  send,
  onAdd,
  onEdit,
  onMedia,
  value,
  Disc,
  Artwork,
}: {
  state: HostState;
  send: (c: HostCommand) => void;
  onAdd: () => void;
  onEdit: (id: string, studio?: boolean) => void;
  onMedia: (id: string) => void;
  value: PresentationState;
  Disc: ComponentType<{
    game: GameManifest;
    Artwork: ComponentType<CollectionArtworkProps>;
  }>;
  Artwork: ComponentType<CollectionArtworkProps>;
} & { Artwork: ComponentType<CollectionArtworkProps> }) {
  const list = visibleCollectionGames(state),
    catalog = state.catalog || GAMES;
  const index = Math.max(
      0,
      list.findIndex((g) => g.id === state.selectedGameId),
    ),
    game = list[index];
  const motion = useDiscMotion(
    list.length,
    index,
    value.settings.motion,
    (i) => {
      if (list[i]) send({ type: "browseGame", gameId: list[i].id });
    },
  );
  const [cardMenu, setCardMenu] = useState<{
    gameId: string;
    anchor: CardMenuAnchor;
  } | null>(null);
  const filters = state.libraryFilters || EMPTY_LIBRARY_FILTERS,
    filterCount = Object.values(filters).filter(Boolean).length;
  const controls = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (controls.current && !controls.current.contains(e.target as Node))
        controls.current.open = false;
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  const openMenu = (
    g: GameManifest,
    trigger: HTMLElement,
    x: number,
    y: number,
  ) => setCardMenu({ gameId: g.id, anchor: { trigger, x, y } });
  const openGame = () => {
    if (game) send({ type: "selectGame", gameId: game.id });
  };
  const setFilter = (key: keyof typeof filters, val: string) =>
    send({ type: "setFilters", filters: { ...filters, [key]: val } });
  return (
    <main
      className="voyager-collection"
      ref={motion.root}
      data-spin="true"
      aria-label="Game collection"
      onPointerDown={motion.pointerDown}
      onPointerMove={motion.pointerMove}
      onPointerUp={motion.pointerUp}
      onPointerCancel={motion.pointerUp}
      onPointerLeave={motion.pointerLeave}
    >
      <div className="collection-utilities" data-disc-ui="">
        <details
          className="collection-controls"
          ref={controls}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") {
              e.preventDefault();
              controls.current!.open = false;
              controls.current?.querySelector("summary")?.focus();
            }
          }}
        >
          <summary>
            Collection{" "}
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            {filterCount > 0 && (
              <span className="filter-count">{filterCount}</span>
            )}
          </summary>
          <div className="collection-controls-panel">
            <div
              className="collection-view-tabs"
              role="group"
              aria-label="Library view"
            >
              {(["all", "favorites", "recent"] as const).map((view) => (
                <button
                  key={view}
                  aria-pressed={state.libraryView === view}
                  onClick={() => send({ type: "setView", view })}
                >
                  {view === "all"
                    ? "All games"
                    : view === "favorites"
                      ? "Favorites"
                      : "Recent"}
                </button>
              ))}
            </div>
            <div className="collection-index" aria-label="Collection index">
              {list.map((g, i) => (
                <button
                  key={g.id}
                  aria-current={
                    g.id === state.selectedGameId ? "true" : undefined
                  }
                  onClick={() => {
                    motion.goTo(i);
                    controls.current!.open = false;
                  }}
                >
                  <small>{String(i + 1).padStart(2, "0")}</small>
                  <span>{g.title}</span>
                </button>
              ))}
            </div>
            <div className="collection-filter-fields">
              <span className="collection-field-label">FILTERS</span>
              <label>
                Genre
                <select
                  aria-label="Filter by tag"
                  value={filters.tag}
                  onChange={(e) => setFilter("tag", e.target.value)}
                >
                  <option value="">All genres</option>
                  {[...new Set(catalog.flatMap((g) => g.tags || []))].map(
                    (t) => (
                      <option key={t}>{t}</option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Players
                <select
                  aria-label="Filter by players"
                  value={filters.players}
                  onChange={(e) => setFilter("players", e.target.value)}
                >
                  <option value="">Any players</option>
                  {[1, 2, 3, 4].map((p) => (
                    <option key={p} value={p}>
                      {p}+ players
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Connection
                <select
                  aria-label="Filter by connection"
                  value={filters.connection}
                  onChange={(e) => setFilter("connection", e.target.value)}
                >
                  <option value="">Any connection</option>
                  <option value="offline">Offline</option>
                  <option value="online">Online</option>
                  <option value="offline-online">Offline & Online</option>
                </select>
              </label>
              <label>
                Setup
                <select
                  aria-label="Filter by setup"
                  value={filters.setup}
                  onChange={(e) => setFilter("setup", e.target.value)}
                >
                  <option value="">Any setup status</option>
                  <option>Needs setup</option>
                  <option>Ready to test</option>
                  <option>Tested by you</option>
                </select>
              </label>
              {filterCount > 0 && (
                <button
                  className="collection-clear"
                  onClick={() =>
                    send({
                      type: "setFilters",
                      filters: { ...EMPTY_LIBRARY_FILTERS },
                    })
                  }
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        </details>
        <label className="collection-search">
          <Icon name="search" size={16} />
          <input
            aria-label="Find a game"
            placeholder="Find a game"
            maxLength={80}
            value={state.search}
            onChange={(e) => send({ type: "setSearch", query: e.target.value })}
          />
          {state.search && (
            <button
              aria-label="Clear search"
              onClick={() => send({ type: "setSearch", query: "" })}
            >
              ×
            </button>
          )}
        </label>
        <button
          className="collection-add"
          onClick={onAdd}
          aria-label="Add game"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          <span>Add game</span>
        </button>
      </div>
      {game && (
        <section className="collection-details" aria-live="polite">
          <h1 title={game.title}>{game.title}</h1>
          <dl>
            <div>
              <dt>PLAYERS</dt>
              <dd>
                {game.minPlayers === game.maxPlayers
                  ? game.maxPlayers
                  : `${game.minPlayers}–${game.maxPlayers}`}
              </dd>
            </div>
            <div>
              <dt>CONNECTION</dt>
              <dd>
                {game.connection === "online"
                  ? "Online"
                  : game.connection === "offline-online"
                    ? "Offline · Online"
                    : "Local play"}
              </dd>
            </div>
          </dl>
        </section>
      )}
      <div
        className="collection-stage disc-cascade"
        ref={motion.stage}
        aria-label="Game library"
      >
        {motion.renderedIndices.map((i) => {
          const g = list[i];
          const pose = motion.pose(i);
          return (
            <button
              key={g.id}
              ref={(el) => {
                motion.slides.current[i] = el;
              }}
              className={`collection-disc voyager-disc ${i === index ? "selected" : ""}`}
              data-active={i === index ? "" : undefined}
              style={
                {
                  transform: pose.transform,
                  zIndex: pose.zIndex,
                  opacity: pose.opacity,
                  visibility: pose.hidden ? "hidden" : undefined,
                  "--disc-roll": pose.roll,
                  "--disc-glint": pose.glint,
                } as CSSProperties
              }
              aria-label={`Open ${g.title} game lobby`}
              aria-current={i === index ? "true" : undefined}
              tabIndex={i === index ? 0 : -1}
              onClick={() =>
                motion.click(i, () =>
                  send({ type: "selectGame", gameId: g.id }),
                )
              }
              onContextMenu={(e) => {
                e.preventDefault();
                openMenu(g, e.currentTarget, e.clientX, e.clientY);
              }}
            >
              <Disc game={g} Artwork={Artwork} />
            </button>
          );
        })}
      </div>
      {!list.length && (
        <section className="collection-empty">
          <h1>
            {state.libraryView === "favorites"
              ? "No favorites yet"
              : state.libraryView === "recent"
                ? "No games played yet"
                : "No games found"}
          </h1>
          <p>Adjust your collection or clear the search and filters.</p>
          <button
            onClick={() => {
              send({ type: "setSearch", query: "" });
              send({ type: "setView", view: "all" });
              send({
                type: "setFilters",
                filters: { ...EMPTY_LIBRARY_FILTERS },
              });
            }}
          >
            Show all games
          </button>
        </section>
      )}
      {game && (
        <div className="collection-game-actions" data-disc-ui="">
          <button className="collection-open" onClick={openGame}>
            Enter game lobby{" "}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M5 12h14m-6-6 6 6-6 6"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div>
            <button
              aria-label={
                state.favorites.includes(game.id)
                  ? "Remove from favorites"
                  : "Add to favorites"
              }
              aria-pressed={state.favorites.includes(game.id)}
              onClick={() => send({ type: "toggleFavorite", gameId: game.id })}
            >
              <Icon name="heart" size={16} />
            </button>
            <button
              aria-label={`Options for ${game.title}`}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                openMenu(game, e.currentTarget, r.left, r.top);
              }}
            >
              Options
            </button>
            <button onClick={() => onMedia(game.id)}>Artwork & media</button>
          </div>
        </div>
      )}
      <span className="collection-hint" aria-hidden="true">
        DRAG · ← →
      </span>
      <nav
        className="collection-step-controls"
        aria-label="Browse games"
        data-disc-ui=""
      >
        <button
          aria-label="Previous game"
          disabled={list.length < 2}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            motion.startHold(-1);
          }}
          onPointerUp={() => motion.stopHold()}
          onPointerCancel={() => motion.stopHold()}
          onLostPointerCapture={() => motion.stopHold()}
          onClick={(e) => {
            if (e.detail === 0) motion.step(-1);
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M19 12H5m6-6-6 6 6 6"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <span>
          <b>{list.length ? String(index + 1).padStart(2, "0") : "00"}</b> /{" "}
          {String(list.length).padStart(2, "0")}
        </span>
        <button
          aria-label="Next game"
          disabled={list.length < 2}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            motion.startHold(1);
          }}
          onPointerUp={() => motion.stopHold()}
          onPointerCancel={() => motion.stopHold()}
          onLostPointerCapture={() => motion.stopHold()}
          onClick={(e) => {
            if (e.detail === 0) motion.step(1);
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M5 12h14m-6-6 6 6-6 6"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </nav>
      {cardMenu && catalog.some((g) => g.id === cardMenu.gameId) && (
        <LibraryCardMenu
          game={catalog.find((g) => g.id === cardMenu.gameId)!}
          anchor={cardMenu.anchor}
          onEdit={onEdit}
          onClose={() => setCardMenu(null)}
        />
      )}
    </main>
  );
}
