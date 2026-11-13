// How far the world is drawn, and how far off anything in it is kept in the picture at all. What a
// frame costs goes by what lies within these distances of the camera, however big the world is.

/** Nothing further than this ahead of the camera is drawn: by then the haze has all but hidden it. */
export const FAR = 1900;

/**
 * Nothing further than this from the camera, in any direction, is in the picture: a little past
 * FAR, which the far corners of a wide screen reach beyond. Ground, trees and landmarks further
 * off are not looked at when a frame is drawn, and nothing in a landmark is kept moving.
 */
export const SIGHT = 2400;
