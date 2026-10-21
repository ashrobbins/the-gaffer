import type { KitStyle } from '../types';

/** Kit colours available to clubs (and offered to the player when creating a club). */
export const KIT_COLOURS: readonly string[] = [
  '#d32f2f', '#ff8a2b', '#f7c92e', '#43b84a', '#1c7a3a', '#6ccaf5',
  '#1f5fd8', '#1a2a6c', '#8e44d6', '#e86aa8', '#f2f2f2', '#161616',
];

export const KIT_STYLES: readonly KitStyle[] = ['plain', 'hoops', 'stripes', 'sleeves'];
