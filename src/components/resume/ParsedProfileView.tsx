'use client'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { MapPin, Mail, Phone, Briefcase, GraduationCap, Award } from 'lucide-react'
import type { ParsedResume, Resume } from '@/types'

interface ParsedProfileViewProps {
  resume: Resume
  parsedData: ParsedResume
}

export function ParsedProfileView({ resume, parsedData }: ParsedProfileViewProps) {
  const {
    name, email, phone, location, summary,
    skills, experience, education, certifications,
  } = parsedData

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Parsed Profile</h2>
        <Badge variant="secondary">v{resume.version}</Badge>
      </div>

      {/* Header */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-xl font-bold">{name}</h3>
          <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
            {email && (
              <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{email}</span>
            )}
            {phone && (
              <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{phone}</span>
            )}
            {location && (
              <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{location}</span>
            )}
          </div>
          {summary && <p className="mt-3 text-sm leading-relaxed">{summary}</p>}
        </CardContent>
      </Card>

      {/* Skills */}
      {skills?.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="w-4 h-4" /> Skills
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {skills.map((skill, i) => (
                <Badge key={i} variant="outline">{skill}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Experience */}
      {experience?.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Briefcase className="w-4 h-4" /> Experience
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {experience.map((exp, i) => (
              <div key={i}>
                {i > 0 && <Separator className="mb-4" />}
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{exp.title}</p>
                    <p className="text-sm text-muted-foreground">{exp.company}</p>
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-nowrap ml-4">
                    {exp.start_date} — {exp.end_date ?? 'Present'}
                  </p>
                </div>
                {exp.bullets?.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {exp.bullets.map((bullet, j) => (
                      <li key={j} className="text-sm flex gap-2">
                        <span className="text-muted-foreground mt-1 flex-shrink-0">•</span>
                        {bullet}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Education */}
      {education?.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <GraduationCap className="w-4 h-4" /> Education
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {education.map((edu, i) => (
              <div key={i} className="flex justify-between">
                <div>
                  <p className="font-medium">{edu.school}</p>
                  <p className="text-sm text-muted-foreground">{edu.degree} in {edu.field}</p>
                </div>
                <p className="text-xs text-muted-foreground">{edu.graduation_year}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Certifications */}
      {certifications?.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Certifications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {certifications.map((cert, i) => (
                <Badge key={i} variant="secondary">{cert}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
