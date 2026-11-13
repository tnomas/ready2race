import {Card, CardActions, CardContent, CardHeader, Grid2, Typography} from '@mui/material'
import {ReactNode} from 'react'

export const DashboardWidget = (props: {
    size: number | {xs: number; sm?: number; md?: number; lg?: number}
    color?: string
    headerAction?: ReactNode
    header?: string
    content: ReactNode
    footerAction?: ReactNode
    maxHeight?: number | {xs: number; sm?: number; md?: number}
    elevation?: number
}) => {
    const sizeProps = typeof props.size === 'number' ? {xs: props.size} : props.size
    const maxHeightValue =
        props.maxHeight !== undefined
            ? props.maxHeight
            : {
                  xs: 400,
                  lg: 300,
              }

    return (
        <Grid2 size={sizeProps}>
            <Card
                elevation={props.elevation}
                sx={{height: '100%', display: 'flex', flexDirection: 'column'}}>
                {props.header && (
                    <CardHeader
                        action={props.headerAction}
                        title={
                            <Typography variant={'h3'} component={'h2'}>
                                {props.header}
                            </Typography>
                        }
                        sx={{pb: 1, px: {xs: 1.5, md: 2}}}
                    />
                )}
                <CardContent
                    sx={{
                        maxHeight: maxHeightValue,
                        overflowY: 'auto',
                        flexGrow: 1,
                        px: {xs: 1, md: 2},
                        py: {xs: 1, md: 2},
                        '&:last-child': {pb: {xs: 1, md: 2}},
                    }}>
                    {props.content}
                </CardContent>
                {props.footerAction && (
                    <CardActions sx={{justifyContent: 'end', px: {xs: 1.5, md: 2}, py: 1}}>
                        {props.footerAction}
                    </CardActions>
                )}
            </Card>
        </Grid2>
    )
}
