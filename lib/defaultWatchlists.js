export const DEFAULT_WATCHLISTS = {
  1: ['AVGO', 'TSLA', 'QCOM', 'RKLB', 'BE', 'PLTR', 'ARKG'],
  2: [],
  3: [],
  4: [],
  5: [],
  6: [],
};

export function cloneDefaultWatchlists() {
  return Object.fromEntries(
    Object.entries(DEFAULT_WATCHLISTS).map(([key, symbols]) => [key, [...symbols]]),
  );
}
