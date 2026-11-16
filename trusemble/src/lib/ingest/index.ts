import { nfpaFirewise, odfFuels, fsFacts } from './arcgis';
import { usaSpending, grantsGov, openFema } from './federal';
import { tigerCounties, femaNri } from './counties';
import type { Fetcher } from './runner';

/** Run order matters: counties before risk scores, programs (Grants.gov) before awards, organizations before awards. */
export const FETCHERS: Fetcher[] = [tigerCounties, femaNri, grantsGov, nfpaFirewise, odfFuels, fsFacts, openFema, usaSpending];
export const byId = (id: string) => FETCHERS.find((f) => f.id === id);
