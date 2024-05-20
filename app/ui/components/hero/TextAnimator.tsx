"use client";

import { TypeAnimation } from 'react-type-animation';

export default function TextAnimator({ className = "" }: {
    className?: string
}){
    return (
        <>
            <TypeAnimation
                sequence={[
                    // Same substring at the start will only be typed out once, initially
                    'Lwin Maung Maung',
                    3000, // wait 1s before replacing "Mice" with "Hamsters"
                    'Software Engineer',
                    3000,
                    'Backend Developer',
                    3000,
                    'Full-Stack Developer',
                    3000
                ]}
                wrapper="span"
                speed={50}
                repeat={Infinity}
                className={className}
            />
        </>
    );
}
