import { CAR, atDoor, stationLook } from './three/train-ride.js';

describe('train ride doors', () => {
  it('lets you off only at a door on the side that opened', () => {
    const z = CAR.doorZ[1];
    expect(atDoor(-1.2, z, 'left')).toBe(true);
    expect(atDoor(-1.2, z, 'right')).toBe(false);
    expect(atDoor(1.2, z, 'right')).toBe(true);
    expect(atDoor(1.2, z + 3, 'right')).toBe(false); // between doors
    expect(atDoor(0, z, 'right')).toBe(false); // the middle of the car
  });

  it('opens the doors on the right at side platforms and the left at islands', () => {
    expect(stationLook({ doors: 'right', layout: 'side', level: 'elevated' }).doors).toBe('right');
    expect(stationLook({ doors: 'left', layout: 'island', level: 'tunnel' }).level).toBe('tunnel');
  });

  it('falls back to an elevated island when nothing is known', () => {
    expect(stationLook(null)).toEqual({ doors: 'left', layout: 'island', level: 'elevated', segments: null });
    expect(stationLook({ level: 'underwater' }).level).toBe('elevated');
  });
});
