import type { Variants, Transition } from "motion/react";

export const spring: Transition = { type: "spring", stiffness: 260, damping: 30, mass: 0.8 };
export const springSoft: Transition = { type: "spring", stiffness: 120, damping: 18 };

/** Stagger container for grids of cards. */
export const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

/** Individual tile entry. */
export const fadeUpItem: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: "spring", bounce: 0.08, duration: 0.5 } },
};

export const fadeItem: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.4 } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: spring },
};

export const slideFromRight: Variants = {
  hidden: { x: "100%" },
  show: { x: 0, transition: { type: "spring", stiffness: 320, damping: 34 } },
  exit: { x: "100%", transition: { duration: 0.2 } },
};
