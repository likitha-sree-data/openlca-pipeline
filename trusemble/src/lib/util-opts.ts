import { PROJECT_CATEGORIES } from './constants';
export const categoriesOpts = PROJECT_CATEGORIES.map((c) => [c[0], c[1]] as [string, string]);
