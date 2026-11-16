import { openDatabase, setDb } from '../src/lib/db';

export function freshDb() {
  const d = openDatabase(':memory:');
  setDb(d);
  return d;
}
