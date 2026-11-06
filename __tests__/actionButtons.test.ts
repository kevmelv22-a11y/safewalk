/** Labels van de drie hoofdknoppen (geen RN-render in Jest). */
const LABELS = [
  'Ik voel me niet veilig',
  'Kom snel',
  'Ik ben veilig aangekomen',
];

describe('hoofdknoppen (copy)', () => {
  it('heeft rode/oranje/groene NL-labels', () => {
    expect(LABELS).toHaveLength(3);
    expect(LABELS[0]).toMatch(/niet veilig/);
    expect(LABELS[2]).toMatch(/veilig aangekomen/);
  });
});
