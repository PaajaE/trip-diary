import type { ChecklistTemplate } from '@/entities/checklist/model/checklist'

export const CHECKLIST_TEMPLATES: ChecklistTemplate[] = [
  {
    descriptionKey: 'checklist.templates.ceskeSvycarsko.description',
    regionKey: 'checklist.templates.ceskeSvycarsko.region',
    slug: 'ceske-svycarsko',
    titleKey: 'checklist.templates.ceskeSvycarsko.title',
    items: [
      {
        category: 'wildlife',
        createPlannedStop: true,
        latitude: 50.885,
        longitude: 14.282,
        notesKey: 'checklist.templates.ceskeSvycarsko.items.peregrine.notes',
        slug: 'peregrine',
        titleKey: 'checklist.templates.ceskeSvycarsko.items.peregrine.title',
      },
      {
        category: 'wildlife',
        notesKey: 'checklist.templates.ceskeSvycarsko.items.kingfisher.notes',
        slug: 'kingfisher',
        titleKey: 'checklist.templates.ceskeSvycarsko.items.kingfisher.title',
      },
      {
        category: 'flora',
        createPlannedStop: true,
        latitude: 50.864,
        longitude: 14.267,
        notesKey: 'checklist.templates.ceskeSvycarsko.items.orchids.notes',
        slug: 'orchids',
        titleKey: 'checklist.templates.ceskeSvycarsko.items.orchids.title',
      },
      {
        category: 'geology',
        createPlannedStop: true,
        latitude: 50.8835,
        longitude: 14.2823,
        notesKey:
          'checklist.templates.ceskeSvycarsko.items.pravcickaBrana.notes',
        slug: 'pravcicka-brana',
        titleKey:
          'checklist.templates.ceskeSvycarsko.items.pravcickaBrana.title',
      },
      {
        category: 'geology',
        notesKey:
          'checklist.templates.ceskeSvycarsko.items.sandstoneFormations.notes',
        slug: 'sandstone-formations',
        titleKey:
          'checklist.templates.ceskeSvycarsko.items.sandstoneFormations.title',
      },
      {
        category: 'landmark',
        createPlannedStop: true,
        latitude: 50.8503,
        longitude: 14.2572,
        notesKey:
          'checklist.templates.ceskeSvycarsko.items.edmundovaSoutezka.notes',
        slug: 'edmundova-soutezka',
        titleKey:
          'checklist.templates.ceskeSvycarsko.items.edmundovaSoutezka.title',
      },
    ],
  },
  {
    descriptionKey: 'checklist.templates.krkonose.description',
    regionKey: 'checklist.templates.krkonose.region',
    slug: 'krkonose',
    titleKey: 'checklist.templates.krkonose.title',
    items: [
      {
        category: 'wildlife',
        notesKey: 'checklist.templates.krkonose.items.chamois.notes',
        slug: 'chamois',
        titleKey: 'checklist.templates.krkonose.items.chamois.title',
      },
      {
        category: 'wildlife',
        notesKey: 'checklist.templates.krkonose.items.marmot.notes',
        slug: 'marmot',
        titleKey: 'checklist.templates.krkonose.items.marmot.title',
      },
      {
        category: 'flora',
        createPlannedStop: true,
        latitude: 50.736,
        longitude: 15.74,
        notesKey: 'checklist.templates.krkonose.items.edelweiss.notes',
        slug: 'edelweiss',
        titleKey: 'checklist.templates.krkonose.items.edelweiss.title',
      },
      {
        category: 'flora',
        notesKey: 'checklist.templates.krkonose.items.cloudberry.notes',
        slug: 'cloudberry',
        titleKey: 'checklist.templates.krkonose.items.cloudberry.title',
      },
      {
        category: 'geology',
        createPlannedStop: true,
        latitude: 50.7355,
        longitude: 15.739,
        notesKey: 'checklist.templates.krkonose.items.snezka.notes',
        slug: 'snezka',
        titleKey: 'checklist.templates.krkonose.items.snezka.title',
      },
      {
        category: 'landmark',
        notesKey: 'checklist.templates.krkonose.items.pecPodSnezkou.notes',
        slug: 'pec-pod-snezkou',
        titleKey: 'checklist.templates.krkonose.items.pecPodSnezkou.title',
      },
    ],
  },
  {
    descriptionKey: 'checklist.templates.sumava.description',
    regionKey: 'checklist.templates.sumava.region',
    slug: 'sumava',
    titleKey: 'checklist.templates.sumava.title',
    items: [
      {
        category: 'wildlife',
        notesKey: 'checklist.templates.sumava.items.lynx.notes',
        slug: 'lynx',
        titleKey: 'checklist.templates.sumava.items.lynx.title',
      },
      {
        category: 'wildlife',
        notesKey: 'checklist.templates.sumava.items.capercaillie.notes',
        slug: 'capercaillie',
        titleKey: 'checklist.templates.sumava.items.capercaillie.title',
      },
      {
        category: 'flora',
        notesKey: 'checklist.templates.sumava.items.bogPine.notes',
        slug: 'bog-pine',
        titleKey: 'checklist.templates.sumava.items.bogPine.title',
      },
      {
        category: 'geology',
        createPlannedStop: true,
        latitude: 48.974,
        longitude: 13.36,
        notesKey: 'checklist.templates.sumava.items.plechy.notes',
        slug: 'plechy',
        titleKey: 'checklist.templates.sumava.items.plechy.title',
      },
      {
        category: 'landmark',
        createPlannedStop: true,
        latitude: 48.77,
        longitude: 13.86,
        notesKey: 'checklist.templates.sumava.items.boubinskyPramen.notes',
        slug: 'boubinsky-pramen',
        titleKey: 'checklist.templates.sumava.items.boubinskyPramen.title',
      },
    ],
  },
]

export function getChecklistTemplate(
  slug: string,
): ChecklistTemplate | undefined {
  return CHECKLIST_TEMPLATES.find((template) => template.slug === slug)
}

export function listAppliedTemplateSlugs(
  items: { templateSlug: string }[],
): string[] {
  return [...new Set(items.map((item) => item.templateSlug))]
}
