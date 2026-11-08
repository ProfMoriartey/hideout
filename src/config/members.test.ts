import { describe, expect, it } from 'vitest';
import { MEMBERS, MEMBER_BY_ID, MEMBER_IDS, isMemberId } from './members';

const SPEC = [
  ['chrollo', 'Chrollo', 'Coordinator', 'planning, tracking, scheduling, briefing the team'],
  ['elders', 'The Elders', 'Founder council', 'strategy, money, pricing, brand, marketing, launch'],
  ['pakunoda', 'Pakunoda', 'Planner', 'questions, specs, tickets, pre-mortems'],
  ['shalnark', 'Shalnark', 'Architect', 'system design, APIs, code structure'],
  ['kortopi', 'Kortopi', 'Front-end engineer', 'web apps, interfaces, mobile apps'],
  ['phinks', 'Phinks', 'Back-end engineer', 'databases, servers, APIs'],
  ['feitan', 'Feitan', 'QA tester', 'browser testing, test-first, breaking things'],
  ['machi', 'Machi', 'Code reviewer', 'code review, debugging, bug fixing'],
  ['nobunaga', 'Nobunaga', 'Security guard', 'security review, safe code'],
  ['franklin', 'Franklin', 'DevOps', 'deployment pipelines, cloud, monitoring'],
  ['shizuku', 'Shizuku', 'Cleanup', 'refactors, old code, documentation'],
  ['bonolenov', 'Bonolenov', 'AI and data', 'AI assistants, data pipelines, search'],
  ['kalluto', 'Kalluto', 'Platform specialist', 'online stores, websites, CLIs, games'],
] as const;

describe('members config', () => {
  it('has exactly the 13 members from the spec', () => {
    expect(MEMBERS).toHaveLength(13);
    expect([...MEMBER_IDS].sort()).toEqual(SPEC.map(([id]) => id).sort());
  });

  it.each(SPEC)('%s has the exact name, role and plaque', (id, name, role, plaque) => {
    const m = MEMBER_BY_ID[id];
    expect(m.name).toBe(name);
    expect(m.role).toBe(role);
    expect(m.plaque).toBe(plaque);
  });

  it('gives every member a unique room slot inside the 3-column grid', () => {
    const keys = MEMBERS.map((m) => `${m.slot.col},${m.slot.floor}`);
    expect(new Set(keys).size).toBe(13);
    for (const m of MEMBERS) {
      expect(m.slot.col).toBeGreaterThanOrEqual(0);
      expect(m.slot.col).toBeLessThan(3);
      expect(m.slot.floor).toBeGreaterThanOrEqual(0);
      expect(m.slot.floor).toBeLessThan(5);
    }
  });

  it('puts Chrollo at the bottom centre and the Elders on a side of the ground floor', () => {
    expect(MEMBER_BY_ID.chrollo.slot).toEqual({ col: 1, floor: 0 });
    expect(MEMBER_BY_ID.elders.slot.floor).toBe(0);
    expect(MEMBER_BY_ID.elders.slot.col).not.toBe(1);
  });

  it('keeps all 11 Spiders above the ground floor', () => {
    const spiders = MEMBERS.filter((m) => m.id !== 'chrollo' && m.id !== 'elders');
    expect(spiders).toHaveLength(11);
    expect(spiders.every((m) => m.slot.floor > 0)).toBe(true);
  });

  it('has unique stations, a prop and valid colours for everyone', () => {
    expect(new Set(MEMBERS.map((m) => m.station)).size).toBe(13);
    for (const m of MEMBERS) {
      expect(m.prop.length).toBeGreaterThan(0);
      for (const c of Object.values(m.colors)) {
        expect(Number.isInteger(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(0xffffff);
      }
    }
  });

  it('isMemberId accepts only known ids', () => {
    expect(isMemberId('machi')).toBe(true);
    expect(isMemberId('hisoka')).toBe(false);
    expect(isMemberId('toString')).toBe(false);
    expect(isMemberId(3)).toBe(false);
  });
});
