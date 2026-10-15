import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { FlatLay } from './garment'
import { DRESS_PIECES, FOUR_PIECES } from '@/fixtures/flatlay'

describe('FlatLay', () => {
  it('puts four pieces in a 2x2 grid: top left, layer right, bottom left, shoes right', () => {
    const { container } = render(<FlatLay pieces={FOUR_PIECES} onPieceClick={() => {}} />)
    const cells = Array.from(container.querySelectorAll('button'))
    const where = Object.fromEntries(cells.map((c) => [c.getAttribute('aria-label'), c.className]))
    expect(where['Swap Cream cotton shirt']).toContain('col-start-1 row-start-1')
    expect(where['Swap Olive cardigan']).toContain('col-start-2 row-start-1')
    expect(where['Swap Navy straight jeans']).toContain('col-start-1 row-start-2')
    expect(where['Swap White trainers']).toContain('col-start-2 row-start-2')
  })

  it('gives a dress the left column and shoes the right', () => {
    const { container } = render(<FlatLay pieces={DRESS_PIECES} onPieceClick={() => {}} />)
    const dress = screen.getByRole('button', { name: 'Swap Green midi dress' })
    const shoes = screen.getByRole('button', { name: 'Swap Brown loafers' })
    expect(dress.className).toContain('col-start-1 row-span-2')
    expect(shoes.className).toContain('col-start-2 row-span-2')
    expect(container.querySelectorAll('img')).toHaveLength(2)
  })

  it('reports which slot was tapped so pieces can be swapped', () => {
    const onClick = vi.fn()
    render(<FlatLay pieces={FOUR_PIECES} onPieceClick={onClick} />)
    fireEvent.click(screen.getByRole('button', { name: 'Swap Olive cardigan' }))
    expect(onClick).toHaveBeenCalledWith('layer')
  })

  it('is a labelled image when not interactive', () => {
    render(<FlatLay pieces={FOUR_PIECES} />)
    expect(screen.getByRole('img', { name: /Outfit: Cream cotton shirt/ })).toBeInTheDocument()
  })
})
