export type UiLabels = {
  distanceMethod: string;
  straightLine: string;
  driving: string;
  walking: string;
  rankBy: string;
  time: string;
  distance: string;
  advanced: string;
  animateRoutes: string;
  reverseDirection: string;
  mapless: string;
  maplessHelp: string;
  showScale: string;
  showScaleHelp: string;
  destination: string;
  locations: string;
  destPlaceholder: string;
  locPlaceholder: string;
  useMyLocation: string;
  locEmpty: string;
  startHere: string;
  step1: string;
  step2: string;
  step3: string;
  emptyHelp: string;
  sample: string;
  sampleButton: string;
  share: string;
  fit: string;
  clear: string;
  howTo: string;
  mapLabel: string;
  rankedLocations: string;
};

export const defaultLabels: UiLabels = {
  distanceMethod: 'Distance method',
  straightLine: 'Straight line',
  driving: 'Driving',
  walking: 'Walking',
  rankBy: 'Rank by',
  time: 'Time',
  distance: 'Distance',
  advanced: 'Advanced settings',
  animateRoutes: 'Animate routes',
  reverseDirection: 'Reverse direction',
  mapless: 'List only',
  maplessHelp: 'Hide the map and show the ranked comparison list.',
  showScale: 'Show scale ruler',
  showScaleHelp: 'Show the map distance scale.',
  destination: 'Destination',
  locations: 'Locations',
  destPlaceholder: 'Search, coordinates, or Maps link',
  locPlaceholder: 'Search, coordinates, or Maps link',
  useMyLocation: 'Use my location',
  locEmpty: 'Search a place, paste coordinates, or click the map to add a comparison location.',
  startHere: 'Start here',
  step1: 'Set a destination',
  step2: 'Add locations to compare',
  step3: 'Pick a route mode',
  emptyHelp: 'Search for a place, enter coordinates, or click the map to begin.',
  sample: 'Load sample data',
  sampleButton: 'Sample',
  share: 'Share this comparison',
  fit: 'Fit all items on the map',
  clear: 'Clear all locations',
  howTo: 'How to use Geoproximity',
  mapLabel: 'Geoproximity map',
  rankedLocations: 'Ranked locations',
};

export function mergeLabels(labels?: Partial<UiLabels>): UiLabels {
  return { ...defaultLabels, ...labels };
}
