import type { Metadata } from "next";
import { AuraToy } from "./AuraToy";

export const metadata: Metadata = {
  title: "Aura",
  description: "A synesthesia simulator that turns a word and a melody into a downloadable aura.",
};

export default function Home() {
  return <AuraToy />;
}
