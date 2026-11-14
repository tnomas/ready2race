import {Paper, Stack, Typography} from '@mui/material'
import {useMemo} from 'react'
import {useFormContext, useWatch} from 'react-hook-form-mui'
import {useTranslation} from 'react-i18next'
import {useEventRegistration} from '@contexts/eventRegistration/EventRegistrationContext.ts'
import {EventRegistrationFormData} from '../../pages/eventRegistration/EventRegistrationCreatePage.tsx'
import {
    competitionMapOf,
    formatAmount,
    hasAnyFees,
    registrationFees,
} from './eventRegistrationLogic.ts'

/**
 * Laufende Summe des Meldegelds für das, was mit diesem Absenden übertragen wird. Bleibt beim
 * Durchblättern der Schritte sichtbar; in der Nachmeldephase getrennt nach regulär und Nachmeldung.
 */
export const EventRegistrationFeeDisplay = () => {
    const {t} = useTranslation()
    const formContext = useFormContext<EventRegistrationFormData>()
    const {info} = useEventRegistration()

    const competitionRegistrations = useWatch({
        control: formContext.control,
        name: 'competitionRegistrations',
    })
    const participants = useWatch({control: formContext.control, name: 'participants'})

    const competitionMap = useMemo(() => competitionMapOf(info), [info])

    const fees = useMemo(
        () => registrationFees(participants, competitionRegistrations, competitionMap),
        [participants, competitionRegistrations, competitionMap],
    )

    if (!hasAnyFees(competitionMap)) return null

    return (
        <Paper
            variant={'outlined'}
            sx={{
                width: {xs: '100%', md: '240px'},
                flexShrink: 0,
            }}>
            <Stack
                p={{xs: 1, sm: 1.5}}
                direction={{xs: 'row', md: 'column'}}
                spacing={{xs: 2, md: 0}}
                justifyContent={{xs: 'space-between', md: 'flex-start'}}
                alignItems={{xs: 'center', md: 'flex-end'}}
                aria-live={'polite'}>
                <Stack alignItems={{xs: 'flex-start', md: 'flex-end'}}>
                    <Typography variant={'caption'}>{t('event.registration.totalFees')}</Typography>
                    <Typography variant={'h5'} component={'p'}>
                        {formatAmount(fees.regular)}
                    </Typography>
                </Stack>
                {info?.state !== 'REGULAR' && (
                    <Stack alignItems={{xs: 'flex-end', md: 'flex-end'}}>
                        <Typography variant={'caption'}>
                            {t('event.registration.lateTotalFees')}
                        </Typography>
                        <Typography variant={'h5'} component={'p'}>
                            {formatAmount(fees.late)}
                        </Typography>
                    </Stack>
                )}
            </Stack>
        </Paper>
    )
}
