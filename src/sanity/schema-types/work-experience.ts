import { defineField, defineType } from "sanity";

export const workExperience = defineType({
  name: "workExperience",
  title: "Work Experience",
  type: "document",
  fields: [
    defineField({
      name: "title",
      type: "string",
    }),
    defineField({
      name: "jobTitle",
      title: "Job Title",
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "jobTitleEs",
      title: "Job Title (ES)",
      type: "string",
    }),
    defineField({
      name: "startDate",
      title: "Start Date",
      type: "date",
      validation: (rule) => rule.required(),
      options: {
        dateFormat: "MMM-YYYY",
      },
    }),
    defineField({
      name: "endDate",
      title: "End Date",
      type: "date",
      options: {
        dateFormat: "MMM-YYYY",
      },
      hidden: ({ document }) => document?.current === true,
    }),
    defineField({
      name: "current",
      title: "Current",
      type: "boolean",
    }),
    defineField({
      name: "hideDescription",
      title: "Hide Description",
      description:
        "If enabled, only job title, company and dates will be shown (no job description)",
      type: "boolean",
    }),
    defineField({
      name: "companyName",
      title: "Company Name",
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "companyNameEs",
      title: "Company Name (ES)",
      type: "string",
    }),
    defineField({
      name: "location",
      title: "Location",
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "locationEs",
      title: "Location (ES)",
      type: "string",
    }),
    defineField({
      name: "jobDescription",
      title: "Job Description",
      type: "array",
      of: [
        {
          title: "Block",
          type: "block",
          styles: [{ title: "Normal", value: "normal" }],
          lists: [
            { title: "Bullet", value: "bullet" },
            { title: "Numbered", value: "number" },
          ],
        },
      ],
    }),
    defineField({
      name: "jobDescriptionEs",
      title: "Job Description (ES)",
      type: "array",
      of: [
        {
          title: "Block",
          type: "block",
          styles: [{ title: "Normal", value: "normal" }],
          lists: [
            { title: "Bullet", value: "bullet" },
            { title: "Numbered", value: "number" },
          ],
        },
      ],
    }),
    defineField({
      name: "chronoIndex",
      title: "Chronological work experience",
      type: "number",
      options: {
        list: [
          { title: "1", value: 1 },
          { title: "2", value: 2 },
          { title: "3", value: 3 },
          { title: "4", value: 4 },
          { title: "5", value: 5 },
        ],
      },
      validation: (rule) => rule.required(),
    }),
  ],
});
