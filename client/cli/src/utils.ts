import { readFile } from "node:fs/promises";


export async function getMounts(
    paths: Array<string>,
    mounts: Array<string>,
) {
    const files = paths
        ? await Promise.all(
            paths.map((p: string) => readFile(p))
        )
        : [];

    return mounts
        // Zip the mount names to blobs read from local file paths.
        ? Object.fromEntries(mounts
            .map((m: string, i: number) => {
                const blob =  new Blob([files[i]]);
                return [m, blob];
            }))
        : {};
}