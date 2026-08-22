import {
  NO_FILTERS,
  clearFilter,
  hasSelection,
  isValueSelected,
  normalizeSelection,
  parseSelection,
  reconcileSelection,
  sameSelection,
  serializeSelection,
  toggleValue,
} from './storefront-filters';
import type { StorefrontFilterDto } from './contracts/catalog.types';

const FILTERS: readonly StorefrontFilterDto[] = [
  {
    key: 'material',
    label: 'Material',
    values: [
      { key: 'steel', label: 'Steel' },
      { key: 'aluminium', label: 'Aluminium' },
    ],
  },
  { key: 'finish', label: 'Finish', values: [{ key: 'black', label: 'Black' }] },
];

/**
 * The selection rules, on their own.
 *
 * This is where the phase's URL contract actually lives: one canonical form per query,
 * so that a shared link, a reload and a re-click all produce the same request and the
 * same cursor fingerprint. Angular implements no matching - OR within a filter and AND
 * across filters are the backend's - so what is tested here is normalisation, safety at
 * the URL boundary, and reconciliation against a category's own projection.
 */
describe('storefront filter selection', () => {
  describe('normalisation', () => {
    it('orders filter keys deterministically', () => {
      const a = normalizeSelection({ material: ['steel'], finish: ['black'] });
      const b = normalizeSelection({ finish: ['black'], material: ['steel'] });

      // Click order is not application state: two buyers who chose the same things in a
      // different order must produce the same URL.
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(Object.keys(a)).toEqual(['finish', 'material']);
    });

    it('orders values within a filter', () => {
      expect(normalizeSelection({ material: ['steel', 'aluminium'] })).toEqual({
        material: ['aluminium', 'steel'],
      });
    });

    it('removes duplicate values', () => {
      // "Reordering or duplicating values does not change the query", so it must not
      // change the URL either.
      expect(normalizeSelection({ material: ['steel', 'steel', 'aluminium'] })).toEqual({
        material: ['aluminium', 'steel'],
      });
    });

    it('removes empty arrays entirely', () => {
      // A filter with nothing chosen is not a constraint, and an empty array would be a
      // second spelling of "no filters" for the cursor fingerprint to trip over.
      expect(normalizeSelection({ material: [], finish: ['black'] })).toEqual({
        finish: ['black'],
      });
    });

    it('serialises to null when nothing is selected', () => {
      expect(serializeSelection(NO_FILTERS)).toBeNull();
      expect(serializeSelection({ material: [] })).toBeNull();
      expect(hasSelection(NO_FILTERS)).toBe(false);
    });

    it('serialises the canonical form', () => {
      expect(serializeSelection({ material: ['steel', 'aluminium'], finish: ['black'] })).toBe(
        '{"finish":["black"],"material":["aluminium","steel"]}',
      );
    });
  });

  describe('reading untrusted URL state', () => {
    it('restores a selection from its serialised form', () => {
      const selection = { finish: ['black'], material: ['aluminium', 'steel'] };
      expect(parseSelection(serializeSelection(selection))).toEqual(selection);
    });

    it.each([
      ['not json at all', 'material=steel'],
      ['a bare string', '"steel"'],
      ['an array', '["steel"]'],
      ['null', 'null'],
      ['a number', '42'],
      ['truncated json', '{"material":['],
      ['an empty string', ''],
    ])('fails safely on %s', (_label, raw) => {
      // Arbitrary URL JSON must never become query grammar. Anything unrecognisable
      // collapses to "no filters" and the buyer gets the plain category listing.
      expect(parseSelection(raw)).toEqual({});
    });

    it('drops non-string and non-array members rather than passing them through', () => {
      expect(parseSelection('{"material":["steel",7,null],"finish":"black","x":{"a":1}}')).toEqual({
        material: ['steel'],
      });
    });

    it('normalises what it parses', () => {
      expect(parseSelection('{"material":["steel","steel","aluminium"],"finish":[]}')).toEqual({
        material: ['aluminium', 'steel'],
      });
    });
  });

  describe('toggling', () => {
    it('selects one value', () => {
      expect(toggleValue(NO_FILTERS, 'material', 'steel')).toEqual({ material: ['steel'] });
    });

    it('selects several values of one filter', () => {
      const selection = toggleValue(toggleValue(NO_FILTERS, 'material', 'steel'), 'material', 'aluminium');
      expect(selection).toEqual({ material: ['aluminium', 'steel'] });
    });

    it('selects across several filters', () => {
      const selection = toggleValue(
        toggleValue(NO_FILTERS, 'material', 'steel'),
        'finish',
        'black',
      );
      expect(selection).toEqual({ finish: ['black'], material: ['steel'] });
    });

    it('unselects, removing the filter when it empties', () => {
      const one = toggleValue(NO_FILTERS, 'material', 'steel');
      expect(toggleValue(one, 'material', 'steel')).toEqual({});
    });

    it('clears one filter and leaves the others', () => {
      const selection = { material: ['steel'], finish: ['black'] };
      expect(clearFilter(selection, 'material')).toEqual({ finish: ['black'] });
    });

    it('reports what is selected', () => {
      const selection = { material: ['steel'] };
      expect(isValueSelected(selection, 'material', 'steel')).toBe(true);
      expect(isValueSelected(selection, 'material', 'aluminium')).toBe(false);
      expect(isValueSelected(selection, 'finish', 'black')).toBe(false);
    });
  });

  describe('reconciling against a category projection', () => {
    it('keeps what the category offers', () => {
      expect(reconcileSelection({ material: ['steel'] }, FILTERS)).toEqual({ material: ['steel'] });
    });

    it('drops a filter this category does not expose', () => {
      // Sending it would answer `storefront_filter_unknown`; trimming first turns a stale
      // link into a valid listing instead of an error.
      expect(reconcileSelection({ voltage: ['230v'], material: ['steel'] }, FILTERS)).toEqual({
        material: ['steel'],
      });
    });

    it('drops a value the filter does not offer', () => {
      expect(reconcileSelection({ material: ['steel', 'brass'] }, FILTERS)).toEqual({
        material: ['steel'],
      });
    });

    it('drops the filter when none of its values survive', () => {
      expect(reconcileSelection({ material: ['brass'] }, FILTERS)).toEqual({});
    });

    it('substitutes nothing for what it removed', () => {
      // Trimming asks the question again; substituting would answer it for the buyer.
      const reconciled = reconcileSelection({ material: ['brass'] }, FILTERS);
      expect(reconciled['material']).toBeUndefined();
      expect(Object.keys(reconciled)).toHaveLength(0);
    });

    it('drops everything against a category with no filters', () => {
      expect(reconcileSelection({ material: ['steel'] }, [])).toEqual({});
    });
  });

  describe('comparison', () => {
    it('treats differently written but equivalent selections as the same', () => {
      expect(
        sameSelection({ material: ['steel', 'aluminium'] }, { material: ['aluminium', 'steel'] }),
      ).toBe(true);
      expect(sameSelection({ material: ['steel'] }, { material: ['aluminium'] })).toBe(false);
    });
  });

  describe('no ERPNext Item Group anywhere', () => {
    it('never invents an item_group key from a selection', () => {
      const selection = parseSelection('{"item_group":["Fasteners"],"material":["steel"]}');

      // `item_group` is not storefront taxonomy. It survives parsing only as an ordinary
      // key, and reconciliation against a real projection drops it like any other key the
      // category does not publish - there is no special handling because there is no
      // concept here to handle.
      expect(reconcileSelection(selection, FILTERS)).toEqual({ material: ['steel'] });
      expect(serializeSelection(reconcileSelection(selection, FILTERS))).not.toContain('item_group');
    });
  });
});
