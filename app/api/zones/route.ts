import { cachedRoute, options } from "../helpers";

export const OPTIONS = options;
export const GET = () => cachedRoute("zones");
