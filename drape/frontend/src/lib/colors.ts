// Mirrors backend/app/colors.py PALETTE.
export const PALETTE: { name: string; hex: string }[] = [
  { name: 'white', hex: '#F4F4F0' }, { name: 'cream', hex: '#EDE4CF' }, { name: 'beige', hex: '#D3C0A0' },
  { name: 'camel', hex: '#B98A55' }, { name: 'tan', hex: '#A7825C' }, { name: 'brown', hex: '#6B4A32' },
  { name: 'chocolate', hex: '#3F2A1E' }, { name: 'black', hex: '#1C1C1C' }, { name: 'charcoal', hex: '#3A3D40' },
  { name: 'grey', hex: '#80838A' }, { name: 'light grey', hex: '#C2C4C6' }, { name: 'navy', hex: '#1F2D4D' },
  { name: 'denim blue', hex: '#4A6382' }, { name: 'khaki', hex: '#9E9466' }, { name: 'blue', hex: '#2F5DA8' },
  { name: 'light blue', hex: '#9DB8D9' }, { name: 'teal', hex: '#2C6E6E' }, { name: 'green', hex: '#3E7B4A' },
  { name: 'olive', hex: '#5F6136' }, { name: 'sage', hex: '#9CAA8C' }, { name: 'forest green', hex: '#24432F' },
  { name: 'mustard', hex: '#C9A13B' }, { name: 'yellow', hex: '#E8CF4A' }, { name: 'orange', hex: '#D9782F' },
  { name: 'rust', hex: '#A3512B' }, { name: 'red', hex: '#B8302F' }, { name: 'burgundy', hex: '#6B2131' },
  { name: 'pink', hex: '#E3A1B2' }, { name: 'blush', hex: '#E8C6BE' }, { name: 'purple', hex: '#5E3F7A' },
  { name: 'lavender', hex: '#B7A6D1' },
]

export function hexFor(name: string | null | undefined): string {
  return PALETTE.find((p) => p.name === name)?.hex ?? '#80838A'
}

export function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}
