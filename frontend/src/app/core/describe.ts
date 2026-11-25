import { MapTrain, NetworkResponse } from './models';

/** "Blue line train to Daly City · next stop San Leandro · 9 cars · 2 min late" */
export function describeTrain(net: Pick<NetworkResponse, 'stations' | 'lines'> | null, t: MapTrain): string {
  const name = (abbr: string) => net?.stations.find((s) => s.abbr === abbr)?.name ?? abbr;
  const line = net?.lines.find((l) => l.id === t.line);
  const bits = [`${line?.name ?? t.line} line train to ${name(t.dest)}`, t.at ? `at ${name(t.at)}` : `next stop ${name(t.to)}`];
  if (t.cars) bits.push(`${t.cars} cars`);
  if (t.delaySec >= 60) bits.push(`${Math.round(t.delaySec / 60)} min late`);
  return bits.join(' · ');
}
