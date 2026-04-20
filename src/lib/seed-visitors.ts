import type { CardColor } from "./visitor";

export type SeedVisitor = {
  id: string;
  number: number;
  name: string;
  color: CardColor;
  issuedAt: string;
  signature: string;
};

function sigSvg(path: string): string {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 388 252"><path d="${path}" fill="none" stroke="#f3f1eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/></svg>`)}`;
}

export const SEED_VISITORS: SeedVisitor[] = [
  {
    id: "seed-lovely",
    number: 1,
    name: "lovely philosophist",
    color: "teal",
    issuedAt: "2026-03-14T10:00:00Z",
    signature: sigSvg(
      "M130,150 C128,160 126,180 128,195 C130,200 140,200 148,198 L170,194 M148,178 C155,172 165,168 175,170 C182,174 178,184 172,186 C166,188 160,182 168,176 C176,170 186,174 192,180 C196,184 200,178 204,176 L212,180 M218,172 C222,170 226,176 224,180"
    ),
  },
  {
    id: "seed-tangerine",
    number: 2,
    name: "tangerine drifter",
    color: "orange",
    issuedAt: "2026-03-18T14:30:00Z",
    signature: sigSvg(
      "M155,195 C152,188 148,178 152,172 C156,168 164,170 168,176 C170,180 166,186 160,188 C154,190 150,184 156,178 M172,168 L172,196 M172,168 L180,168 M172,182 L178,182 M188,196 C192,186 198,172 206,170 C212,172 208,186 214,188 C220,184 224,174 230,172 C236,174 232,188 236,190 C240,186 244,178 248,180 L258,188 C262,184 266,180 272,182"
    ),
  },
  {
    id: "seed-amber",
    number: 3,
    name: "amber wanderer",
    color: "green",
    issuedAt: "2026-03-10T08:15:00Z",
    signature: sigSvg(
      "M120,190 C124,170 134,155 142,158 C150,162 140,180 134,184 C128,188 136,172 146,166 C154,162 160,168 158,178 C156,188 148,192 154,184 C160,174 170,166 178,170 C184,176 176,190 182,186 C190,180 196,168 204,166 C212,168 206,184 212,186 C218,182 228,170 236,172 C244,176 234,192 240,190 L252,182 C256,180 260,184 258,188"
    ),
  },
  {
    id: "seed-salt",
    number: 4,
    name: "salt cartographer",
    color: "pink",
    issuedAt: "2026-03-12T19:45:00Z",
    signature: sigSvg(
      "M165,188 C170,176 178,164 188,162 C198,164 192,180 186,186 C180,192 188,178 198,172 C206,168 214,174 210,184 L208,190 M220,170 C220,168 222,168 222,170 C222,172 220,172 220,170"
    ),
  },
];
