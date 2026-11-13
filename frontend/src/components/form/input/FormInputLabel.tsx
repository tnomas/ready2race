import {Box, Typography} from '@mui/material'
import {PropsWithChildren, ReactNode} from 'react'
import {useTranslation} from 'react-i18next'

type Props = {
    label: ReactNode
    required?: boolean
    horizontal?: boolean
    reverse?: boolean
}
const FormInputLabel = (props: PropsWithChildren<Props>) => {
    const {t} = useTranslation()

    return props.label ? (
        <label
            style={
                props.horizontal
                    ? {
                          display: 'flex',
                          alignItems: 'center',
                          flexDirection: props.reverse ? 'row-reverse' : 'row',
                          justifyContent: props.reverse ? 'flex-end' : 'flex-start',
                      }
                    : {}
            }
            className={props.horizontal ? 'form-label-horizontal' : undefined}>
            <Box
                sx={{
                    display: 'flex',
                    columnGap: 0.75,
                    flexWrap: 'wrap',
                    alignItems: 'baseline',
                    mr: props.horizontal ? 1 : undefined,
                    mb: !props.horizontal ? 0.75 : undefined,
                }}>
                <Typography variant={'subtitle2'} component={'span'} color={'text.primary'}>
                    {props.label}
                </Typography>
                {/* Pflicht ist der Normalfall; nur das Abweichende, „optional", wird benannt. */}
                {!props.required && (
                    <Typography variant={'caption'} component={'span'} color={'text.secondary'}>
                        {`(${t('common.form.optional')})`}
                    </Typography>
                )}
            </Box>
            {props.children}
        </label>
    ) : (
        <>{props.children}</>
    )
}

export default FormInputLabel
