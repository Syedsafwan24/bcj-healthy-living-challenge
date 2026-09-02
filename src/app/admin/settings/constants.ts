/**
 * Shared constants for the settings screens.
 *
 * Kept out of `actions.ts` because that file is `"use server"`, and a server
 * action module may only export async functions — not plain values.
 */

/** Typed by hand before anything is deleted. Not a word anyone types twice. */
export const RESET_PHRASE = "CLEAR ALL RECORDS";
