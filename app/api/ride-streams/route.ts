import { options, cachedRoute } from "../helpers";

export const OPTIONS = options;
export const GET = () => cachedRoute("ride-streams", 1800);
