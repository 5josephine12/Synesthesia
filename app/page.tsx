import type { Metadata } from "next";
import { AuraToy } from "./AuraToy";

export const metadata: Metadata = {
  title: "Aura",
  description: "A synesthesia simulator that turns melody into a luminous visual composition.",
};

export default function Home() {
  return <AuraToy />;
}
