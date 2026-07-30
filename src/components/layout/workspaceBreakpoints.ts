/**
 * Single source of truth for the workspace's progress-rail breakpoint.
 *
 * At or above this width the progress panel is a third grid column (the rail);
 * below it, the floating `WorkspaceTools` toolbar carries the Progress sheet
 * trigger instead. The JS media query and the toolbar's CSS hide rule MUST
 * agree: when they drifted (rail at 1792px, toolbar hidden from 1536px) there
 * was a 1536–1791px band — 1920px screens at 125% scaling, 1600px monitors,
 * 16" MacBooks — where neither appeared and degree progress was unreachable.
 */
export const PROGRESS_RAIL_MIN_WIDTH = 1792;

export const PROGRESS_RAIL_QUERY = `(min-width: ${PROGRESS_RAIL_MIN_WIDTH}px)`;

/**
 * The `3xl` breakpoint is defined as 112rem (= 1792px) in `globals.css`.
 *
 * These MUST use the named `3xl:` variant rather than an arbitrary
 * `min-[1792px]:` one: Tailwind emits arbitrary min-width variants before the
 * named breakpoints, so `xl:grid-cols-…` (1280px) would win over a wider
 * `min-[1792px]:grid-cols-…` at equal specificity and the rail would never get
 * its column. `workspaceBreakpoints.test.ts` guards the rem/px pairing.
 */
export const PROGRESS_RAIL_REM = PROGRESS_RAIL_MIN_WIDTH / 16;

/**
 * Hiding the toolbar in CSS (in addition to the conditional render) keeps it
 * from flashing on wide screens before hydration, while the media-query
 * snapshot is still `false`.
 */
export const WORKSPACE_TOOLS_HIDDEN_CLASS = "3xl:hidden";

/** Grid template that adds the progress rail; shares the same breakpoint. */
export const PROGRESS_RAIL_GRID_CLASS =
  "3xl:grid-cols-[340px_minmax(620px,1fr)_minmax(600px,680px)]";
