export interface PresentationSettings {
  music: boolean;
  musicVolume: number;
  startupSound: boolean;
  motion: "system" | "full" | "reduced";
  trailers: boolean;
  autoplay: boolean;
  trailerSound: boolean;
  trailerVolume: number;
}
export const DEFAULT_PRESENTATION: PresentationSettings = {
  music: true,
  musicVolume: 0.5,
  startupSound: true,
  motion: "system",
  trailers: true,
  autoplay: true,
  trailerSound: true,
  trailerVolume: 0.6,
};
export interface GameMedia {
  banner?: string;
  trailer?: string;
  trailerName?: string;
  trailerDisabled?: boolean;
  trailerAudio?: string;
  trailerAudioChecked?: boolean;
}
export interface PresentationState {
  settings: PresentationSettings;
  games: Record<string, GameMedia>;
  startup?: string;
}
export type PresentationCommand =
  | { type: "get" }
  | { type: "settings"; settings: Partial<PresentationSettings> }
  | { type: "import"; gameId: string; kind: "trailer" | "banner" }
  | { type: "remove"; gameId: string; kind: "trailer" | "banner" }
  | { type: "download" | "ensure"; gameId: string }
  | { type: "startup" };
export interface PresentationResult {
  ok: boolean;
  state?: PresentationState;
  error?: string;
}
export function steamTrailerAppId(
  gameId: string,
  storeRef?: { store: string; id: string },
) {
  const known: Record<string, number> = {
    "idol-showdown": 1742020,
    "hotwheels-unleashed": 1271700,
    "disney-speedstorm": 1537830,
    brawlhalla: 291550,
  };
  if (storeRef?.store === "steam" && /^[1-9]\d{0,9}$/.test(storeRef.id))
    return Number(storeRef.id);
  return known[gameId];
}
