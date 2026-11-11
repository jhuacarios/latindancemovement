import { shiftEnergy, shiftInstruments, shiftTimes } from './timeline.util';

describe('shiftTimes', () => {
  it('corre los tiempos y descarta los negativos o pasados del final', () => {
    expect(shiftTimes([100, 500, 900], -200)).toEqual([300, 700]);
    expect(shiftTimes([100, 500, 900], 300, 1000)).toEqual([400, 800]);
  });
});

describe('shiftEnergy', () => {
  const energy = { stepMs: 250, values: [0.1, 0.2, 0.3, 0.4] };

  it('rellena con ceros si el archivo empieza después', () => {
    expect(shiftEnergy(energy, 500).values).toEqual([0, 0, 0.1, 0.2, 0.3, 0.4]);
  });

  it('recorta el inicio si el archivo empieza antes', () => {
    expect(shiftEnergy(energy, -250).values).toEqual([0.2, 0.3, 0.4]);
  });

  it('desfases menores a medio paso no cambian la curva', () => {
    expect(shiftEnergy(energy, 100)).toEqual(energy);
  });
});

describe('shiftInstruments', () => {
  it('corre todas las pistas igual', () => {
    const out = shiftInstruments({ stepMs: 250, tracks: { vocals: [1, 2], bass: [3, 4] } as never }, 250);
    expect(out.tracks).toEqual({ vocals: [0, 1, 2], bass: [0, 3, 4] });
    const back = shiftInstruments(out, -250);
    expect(back.tracks).toEqual({ vocals: [1, 2], bass: [3, 4] });
  });
});
