import { options, cachedRoute } from "../helpers";

export const OPTIONS = options;
export const GET = () => cachedRoute("athlete", 3600);
