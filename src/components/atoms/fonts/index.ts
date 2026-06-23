import { Paragraph, styled } from 'tamagui';

// Display — Lora, hero moments (app title, splash text)
const DisplayLg = styled(Paragraph, {
  name: 'DisplayLg',
  fontFamily: '$heading',
  size: '$9',
  lineHeight: '$9',
  fontWeight: '700',
  userSelect: 'none',
});

const DisplayMd = styled(Paragraph, {
  name: 'DisplayMd',
  fontFamily: '$heading',
  size: '$8',
  lineHeight: '$8',
  fontWeight: '700',
  userSelect: 'none',
});

// Heading — Lora, section titles
const HeadingLg = styled(Paragraph, {
  name: 'HeadingLg',
  fontFamily: '$heading',
  size: '$7',
  lineHeight: '$7',
  fontWeight: '600',
  userSelect: 'none',
});

const HeadingMd = styled(Paragraph, {
  name: 'HeadingMd',
  fontFamily: '$heading',
  size: '$6',
  lineHeight: '$6',
  fontWeight: '600',
  userSelect: 'none',
});

const HeadingSm = styled(Paragraph, {
  name: 'HeadingSm',
  fontFamily: '$heading',
  size: '$5',
  lineHeight: '$5',
  fontWeight: '600',
  userSelect: 'none',
});

// Body — DM Sans, main readable content
const BodyLg = styled(Paragraph, {
  name: 'BodyLg',
  fontFamily: '$body',
  size: '$4',
  lineHeight: '$4',
  fontWeight: '400',
  userSelect: 'none',
});

const BodyMd = styled(Paragraph, {
  name: 'BodyMd',
  fontFamily: '$body',
  size: '$3',
  lineHeight: '$3',
  fontWeight: '400',
  userSelect: 'none',
});

const BodySm = styled(Paragraph, {
  name: 'BodySm',
  fontFamily: '$body',
  size: '$2',
  lineHeight: '$2',
  fontWeight: '400',
  userSelect: 'none',
});

const BodyLgBold = styled(Paragraph, {
  name: 'BodyLgBold',
  fontFamily: '$body',
  size: '$4',
  lineHeight: '$4',
  fontWeight: '700',
  userSelect: 'none',
});

const BodyMdBold = styled(Paragraph, {
  name: 'BodyMdBold',
  fontFamily: '$body',
  size: '$3',
  lineHeight: '$3',
  fontWeight: '700',
  userSelect: 'none',
});

const BodySmBold = styled(Paragraph, {
  name: 'BodySmBold',
  fontFamily: '$body',
  size: '$2',
  lineHeight: '$2',
  fontWeight: '700',
  userSelect: 'none',
});

// Label — DM Sans Medium, UI chrome (buttons, tabs, captions)
const LabelLg = styled(Paragraph, {
  name: 'LabelLg',
  fontFamily: '$body',
  size: '$2',
  lineHeight: '$2',
  fontWeight: '500',
  userSelect: 'none',
});

const LabelMd = styled(Paragraph, {
  name: 'LabelMd',
  fontFamily: '$body',
  size: '$1',
  lineHeight: '$1',
  fontWeight: '500',
  userSelect: 'none',
});

const LabelSm = styled(Paragraph, {
  name: 'LabelSm',
  fontFamily: '$body',
  size: '$1',
  lineHeight: '$1',
  fontWeight: '400',
  userSelect: 'none',
});

export {
  DisplayLg,
  DisplayMd,
  HeadingLg,
  HeadingMd,
  HeadingSm,
  BodyLg,
  BodyMd,
  BodySm,
  BodyLgBold,
  BodyMdBold,
  BodySmBold,
  LabelLg,
  LabelMd,
  LabelSm,
};
