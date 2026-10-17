import { defineField, defineType } from "sanity";

export const localizedString = defineType({
  name: "localizedString",
  title: "Localized string",
  type: "object",
  fields: [
    defineField({
      name: "en",
      title: "English",
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "es",
      title: "Español",
      type: "string",
      validation: (rule) => rule.required(),
    }),
  ],
});

export const uiStrings = defineType({
  name: "uiStrings",
  type: "document",
  fields: [
    defineField({
      name: "title",
      type: "string",
      initialValue: "UI Strings",
      readOnly: true,
    }),
    defineField({
      name: "sectionTitles",
      title: "Section titles",
      type: "object",
      fields: [
        defineField({
          name: "professionalProfile",
          title: "Professional profile",
          type: "localizedString",
        }),
        defineField({
          name: "skills",
          title: "Skills",
          type: "localizedString",
        }),
        defineField({
          name: "workExperience",
          title: "Work experience",
          type: "localizedString",
        }),
        defineField({
          name: "volunteering",
          title: "Volunteering",
          type: "localizedString",
        }),
        defineField({
          name: "education",
          title: "Education",
          type: "localizedString",
        }),
      ],
    }),
    defineField({
      name: "present",
      title: "Present",
      type: "localizedString",
    }),
  ],
});
