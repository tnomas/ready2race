import {Chip, Stack, Typography} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {MyEventMaterialDto} from '@api/types.gen.ts'

type MyEventMaterialProps = {
    material: MyEventMaterialDto[]
}

// WITHDRAWN kommt vom Server nie an (siehe MyEventRepo.findMaterialRequestsForRegistrations -
// zurückgezogene Anfragen werden dort schon herausgefiltert), die Zuordnung steht trotzdem
// vollständig da, damit ein Statuswert nie ohne Farbe dasteht.
const CHIP_COLOR: Record<MyEventMaterialDto['status'], 'default' | 'success' | 'warning' | 'error'> = {
    REQUESTED: 'default',
    CONFIRMED: 'success',
    WAITLISTED: 'warning',
    DECLINED: 'error',
    WITHDRAWN: 'default',
}

/**
 * Der Materialblock einer Meldung: je Anfrage eine Zeile mit Art, Anbieter und Status. Der
 * Sportler sieht ausschließlich den Stand - weder die Ampel der Veranstaltung noch das Angebot
 * selbst, das ist Sache des Vereins bei der Anmeldung (siehe `material.registration.*`).
 *
 * Kategorie OTHER (Riemen, Steuerausrüstung, ...) erscheint hier bewusst mit: dies ist die
 * einzige Stelle, an der ein Sportler nicht-Boot-Material sieht, und sie trägt deshalb einen
 * Klammerzusatz - anders als ein Boot ist ihr Zweck ohne die Kategorie nicht selbsterklärend.
 */
export const MyEventMaterial = ({material}: MyEventMaterialProps) => {
    const {t} = useTranslation()

    if (material.length === 0) return null

    return (
        <Stack gap={0.5} sx={{mt: 0.5}}>
            {material.map((item, index) => {
                const type =
                    item.count > 1
                        ? t('myEvent.material.countedType', {count: item.count, type: item.typeName})
                        : item.typeName
                const typeLabel =
                    item.category === 'OTHER'
                        ? t('myEvent.material.otherType', {
                              type,
                              category: t(`material.category.${item.category}`),
                          })
                        : type
                const statusLabel = t(`material.requestStatus.${item.status}`)

                return (
                    <Stack
                        // Anbieter und Materialart sind je Angebot eindeutig (Unique-Index auf
                        // material_request), der Index bleibt nur als letzte Absicherung.
                        key={`${item.typeName}-${item.providerName}-${index}`}
                        direction="row"
                        gap={1}
                        alignItems="center"
                        flexWrap="wrap">
                        <Typography variant="body2" color="text.secondary">
                            {t('myEvent.material.line', {
                                type: typeLabel,
                                status: statusLabel,
                                provider: item.providerName,
                            })}
                        </Typography>
                        <Chip size="small" color={CHIP_COLOR[item.status]} label={statusLabel} />
                    </Stack>
                )
            })}
        </Stack>
    )
}
