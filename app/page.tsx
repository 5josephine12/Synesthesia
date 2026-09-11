import type { Metadata } from "next";
import { AuraToy } from "./AuraToy";

export const metadata: Metadata = {
  title: "Synesthesia",
  description: "What does sound look like? Inspired by synesthesia, this work turns live audio into an ever-changing visual experience. Play the piano, make a sound, or let the piece listen to music! Each sound leaves a different visual impression, creating a space where listening becomes a way of seeing. DJ the visuals <3",
};

export default function Home() {
  return <AuraToy />;
}
