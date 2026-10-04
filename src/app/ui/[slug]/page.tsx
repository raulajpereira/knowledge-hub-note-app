import { notFound } from 'next/navigation';
import type { CatalogSlug } from '../catalog';
import Surfaces from '../_demos/Surfaces';
import Buttons from '../_demos/Buttons';
import Chips from '../_demos/Chips';
import Inputs from '../_demos/Inputs';
import SelectDemo from '../_demos/SelectDemo';
import TogglesDemo from '../_demos/TogglesDemo';
import ModalDemo from '../_demos/ModalDemo';
import DrawerDemo from '../_demos/DrawerDemo';
import TableDemo from '../_demos/TableDemo';
import ToastDemo from '../_demos/ToastDemo';
import I18nDemo from '../_demos/I18nDemo';

const DEMOS: Record<CatalogSlug, React.ComponentType> = {
  surfaces: Surfaces,
  buttons: Buttons,
  chips: Chips,
  inputs: Inputs,
  select: SelectDemo,
  toggles: TogglesDemo,
  modal: ModalDemo,
  drawer: DrawerDemo,
  table: TableDemo,
  toast: ToastDemo,
  i18n: I18nDemo,
};

export default async function DemoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const Demo = DEMOS[slug as CatalogSlug];
  if (!Demo) notFound();
  return <Demo />;
}
