import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { bracketApi } from '../services/api';
import { Bracket, Item, BracketMatch, Tournament } from '@/types';
import MediaPreview from '../components/MediaPreview';
import { PageLoader, TypeIcon } from '../components/BracketCard';
import { useAuth } from '../contexts/AuthContext';
import { useSessionBattles } from '../contexts/SessionBattleContext';

interface TournamentRound {
    roundNumber: number;
    matches: BracketMatch[];
    winners: Item[];
    isComplete: boolean;
}

interface ExtendedTournament extends Tournament {
    rounds: TournamentRound[];
    currentRound: number;
    currentMatchIndex: number;
    eliminatedByRound: Record<number, Item[]>;
    targetSize: number; // track selected target size (power of two)
}

// Audio utility for tactile sounds
const createAudioContext = () => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    const playTick = (frequency = 800, duration = 0.1, volume = 0.1) => {
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }

        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(volume, audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration);
    };

    const playSuccessChime = () => {
        // Play a gentle ascending chime
        playTick(600, 0.15, 0.08);
        setTimeout(() => playTick(800, 0.15, 0.06), 50);
        setTimeout(() => playTick(1000, 0.2, 0.04), 100);
    };

    const playSelectionTick = () => {
        playTick(1200, 0.08, 0.06);
    };

    return { playTick, playSuccessChime, playSelectionTick };
};

const isVirtualItem = (item?: Item | null) => {
    if (!item) return false;
    return item.mediaType === 'placeholder' || item.mediaType === 'bye' || item.id < 0;
};

const createByeItem = (bracketId: number, idx: number): Item => ({
    id: -(50000 + idx),
    title: 'BYE',
    mediaType: 'bye',
    mediaUrl: '',
    bracketId
});

const nextPowerOfTwo = (n: number) => {
    if (n <= 1) return 1;
    const p = 1 << Math.floor(Math.log2(n));
    return p === n ? n : p * 2;
};

const matchHasBye = (match: BracketMatch | null): boolean => {
    if (!match) return false;
    const aIsBye = isVirtualItem(match.itemA) && match.itemA.mediaType === 'bye';
    const bIsBye = isVirtualItem(match.itemB) && match.itemB.mediaType === 'bye';
    return aIsBye || bIsBye;
};

const getWinnerOfByeMatch = (match: BracketMatch): Item => {
    const aIsBye = isVirtualItem(match.itemA) && match.itemA.mediaType === 'bye';
    const bIsBye = isVirtualItem(match.itemB) && match.itemB.mediaType === 'bye';

    if (aIsBye && !bIsBye) return match.itemB;
    if (bIsBye && !aIsBye) return match.itemA;
    // Both byes (edge case) - return itemA
    return match.itemA;
};

const BracketPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { addSessionBattle } = useSessionBattles();
    const [tournament, setTournament] = React.useState<ExtendedTournament | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [selectionPopup, setSelectionPopup] = React.useState<{
        items: Item[];
        options: number[];
        bracket: Bracket;
    } | null>(null);
    const [winnerAnimation, setWinnerAnimation] = React.useState<{
        winnerId: number;
        loserId: number;
    } | null>(null);
    const [selectedSize, setSelectedSize] = React.useState<number | null>(null);

    const [completionForm, setCompletionForm] = React.useState<{
        displayName: string;
        comment: string;
    } | null>(null);
    const [isSaving, setIsSaving] = React.useState(false);

    // Initialize audio context
    const audioRef = React.useRef<ReturnType<typeof createAudioContext> | null>(null);

    React.useEffect(() => {
        // Initialize audio on first user interaction
        const initAudio = () => {
            if (!audioRef.current) {
                audioRef.current = createAudioContext();
            }
        };

        document.addEventListener('click', initAudio, { once: true });
        document.addEventListener('keydown', initAudio, { once: true });

        return () => {
            document.removeEventListener('click', initAudio);
            document.removeEventListener('keydown', initAudio);
        };
    }, []);

    React.useEffect(() => {
        const fetchBracket = async () => {
            if (!id) return;

            try {
                const [bracket, items] = await Promise.all([
                    bracketApi.getBracket(parseInt(id)),
                    bracketApi.getBracketItems(parseInt(id))
                ]);

                const bracketItems = items.filter(item => item.bracketId === parseInt(id));

                if (bracketItems.length < 2) {
                    setError('This bracket needs at least 2 items to start a tournament.');
                    return;
                }

                const shuffledItems = [...bracketItems].sort(() => Math.random() - 0.5);

                const total = shuffledItems.length;
                const floorPow = Math.pow(2, Math.floor(Math.log2(total)));
                const ceilPow = nextPowerOfTwo(total);

                const options: number[] = [];
                // push ceiling power-of-two first if it adds BYEs
                if (ceilPow > floorPow) options.push(ceilPow);
                // then push descending powers down to 2 starting from floorPow
                for (let p = floorPow; p >= 2; p = p / 2) {
                    options.push(p);
                }

                setSelectionPopup({ items: shuffledItems, options, bracket });
            } catch (error) {
                console.error('Error fetching bracket:', error);
                setError('Failed to load bracket. Please try again.');
            } finally {
                setLoading(false);
            }
        };

        fetchBracket();
    }, [id]);

    const createTournament = (bracket: Bracket, items: Item[], targetSizeParam?: number): ExtendedTournament => {
        const baseItems = [...items];
        const targetSize = targetSizeParam && targetSizeParam >= 2 ? targetSizeParam : nextPowerOfTwo(baseItems.length);
        const byesToAdd = Math.max(0, targetSize - baseItems.length);
        const bracketId = baseItems[0]?.bracketId ?? bracket.id;

        // Keep real items first, then add BYEs at the end (no shuffling)
        // This ensures BYEs only appear in matches at the end of the first round
        const paddedItems = byesToAdd > 0
            ? [...baseItems, ...Array.from({ length: byesToAdd }, (_, i) => createByeItem(bracketId, i))]
            : baseItems;

        const rounds = createTournamentRounds(paddedItems);
        return {
            bracket,
            items: baseItems, // keep only real items as source-of-truth
            matches: [],
            currentMatch: rounds[0]?.matches[0] || null,
            winners: [],
            finalRanking: [],
            isComplete: false,
            rounds,
            currentRound: 0,
            currentMatchIndex: 0,
            eliminatedByRound: {},
            targetSize
        };
    };

    const createTournamentRounds = (items: Item[]): TournamentRound[] => {
        const rounds: TournamentRound[] = [];
        let currentItems = [...items];
        let roundNumber = 1;

        while (currentItems.length > 1) {
            const matches: BracketMatch[] = [];

            // For the first round, use proper bracket seeding to ensure BYE winners
            // face real match winners in the next round
            if (roundNumber === 1 && currentItems.length > 2) {
                // Use standard tournament bracket seeding
                // This pairs items so that BYE winners will face real match winners in round 2
                const seededItems = seedBracket(currentItems);

                for (let i = 0; i < seededItems.length; i += 2) {
                    const a = seededItems[i];
                    const b = seededItems[i + 1] ?? createByeItem(currentItems[0]?.bracketId || 0, 10000 + i);
                    matches.push({
                        itemA: a,
                        itemB: b,
                        round: roundNumber,
                        matchNumber: Math.floor(i / 2) + 1
                    });
                }
            } else {
                // For subsequent rounds, pair sequentially (standard bracket progression)
                for (let i = 0; i < currentItems.length; i += 2) {
                    const a = currentItems[i];
                    const b = currentItems[i + 1] ?? createByeItem(currentItems[0]?.bracketId || 0, 10000 + i);
                    matches.push({
                        itemA: a,
                        itemB: b,
                        round: roundNumber,
                        matchNumber: Math.floor(i / 2) + 1
                    });
                }
            }

            rounds.push({
                roundNumber,
                matches,
                winners: [],
                isComplete: false
            });

            // Prepare placeholder items for next round
            currentItems = matches.map((_, index) => ({
                id: -(1000 + roundNumber * 100 + index),
                title: `Winner of Match ${index + 1}`,
                mediaType: 'placeholder',
                mediaUrl: '',
                bracketId: items[0]?.bracketId || 0
            }));

            roundNumber++;
        }

        return rounds;
    };

    // Seed the bracket using proper tournament seeding to ensure BYE winners
    // face real match winners in subsequent rounds
    const seedBracket = (items: Item[]): Item[] => {
        const realItems = items.filter(item => item.mediaType !== 'bye');
        const byeItems = items.filter(item => item.mediaType === 'bye');

        if (byeItems.length === 0) {
            // No BYEs, return items as-is
            return items;
        }

        // Strategy: Alternate between real matches and BYE matches
        // In a bracket, positions (0,1) face (2,3), and (4,5) face (6,7), etc.
        // We want: RealMatch, ByeMatch, RealMatch, ByeMatch...
        // This ensures BYE winners face real match winners in round 2
        //
        // Example with 5 items (A,B,C,D,E) in Round of 8:
        // Position 0-1: A vs B (real match)
        // Position 2-3: C vs BYE (BYE match) - C advances to face winner of A/B
        // Position 4-5: D vs E (real match)
        // Position 6-7: BYE vs BYE (BYE match)

        const seeded: Item[] = [];
        let realIndex = 0;
        let byeIndex = 0;

        // Process in groups of 4 (2 matches that will face each other in round 2)
        while (seeded.length < items.length) {
            // First match of the pair - prefer real vs real
            if (realIndex + 1 < realItems.length) {
                seeded.push(realItems[realIndex++]);
                seeded.push(realItems[realIndex++]);
            } else if (realIndex < realItems.length) {
                seeded.push(realItems[realIndex++]);
                seeded.push(byeItems[byeIndex++]);
            } else {
                seeded.push(byeItems[byeIndex++]);
                seeded.push(byeItems[byeIndex++]);
            }

            // Second match of the pair - prefer real vs BYE
            if (seeded.length < items.length) {
                if (realIndex < realItems.length) {
                    seeded.push(realItems[realIndex++]);
                    if (byeIndex < byeItems.length) {
                        seeded.push(byeItems[byeIndex++]);
                    } else {
                        seeded.push(realItems[realIndex++]);
                    }
                } else {
                    seeded.push(byeItems[byeIndex++]);
                    if (byeIndex < byeItems.length) {
                        seeded.push(byeItems[byeIndex++]);
                    }
                }
            }
        }

        return seeded;
    };

    const handleChoice = (chosenItem: Item) => {
        if (!tournament) return;

        // Play selection sound
        audioRef.current?.playSelectionTick();

        const currentRound = tournament.rounds[tournament.currentRound];
        if (!currentRound) return;

        const currentMatch = currentRound.matches[tournament.currentMatchIndex];
        if (!currentMatch) return;

        // Track the loser for final ranking (skip virtual items)
        const loser = chosenItem === currentMatch.itemA ? currentMatch.itemB : currentMatch.itemA;
        if (!isVirtualItem(loser)) {
            const eliminatedItems = tournament.eliminatedByRound[tournament.currentRound] || [];
            tournament.eliminatedByRound[tournament.currentRound] = [...eliminatedItems, loser];
        }

        // Trigger winner animation
        setWinnerAnimation({
            winnerId: chosenItem.id,
            loserId: (loser && loser.id) || chosenItem.id
        });

        // Play success chime after a short delay
        setTimeout(() => {
            audioRef.current?.playSuccessChime();
        }, 300);

        // Delay the tournament state update to allow animation to play
        setTimeout(() => {
            // Update the current round with the winner
            const updatedRound = { ...currentRound };
            updatedRound.winners = [...updatedRound.winners, chosenItem];

            const updatedRounds = [...tournament.rounds];
            updatedRounds[tournament.currentRound] = updatedRound;

            // Move to next match in current round
            const nextMatchIndex = tournament.currentMatchIndex + 1;

            const updatedTournament: ExtendedTournament = {
                ...tournament,
                rounds: updatedRounds,
                currentMatchIndex: nextMatchIndex,
                currentMatch: currentRound.matches[nextMatchIndex] || null
            };

            // Use findNextRealMatch to skip any bye matches and find the next real match
            const nextRealMatchTournament = findNextRealMatch(updatedTournament);

            if (nextRealMatchTournament) {
                setTournament(nextRealMatchTournament);

                // If tournament is complete, prompt for name and comment
                if (nextRealMatchTournament.isComplete) {
                    setCompletionForm({
                        displayName: user?.displayName || '',
                        comment: '',
                    });
                }
            }

            // Clear winner animation
            setWinnerAnimation(null);
        }, 2000); // 2 second delay for animation
    };

    const createFinalRanking = (tournament: ExtendedTournament, rounds: TournamentRound[]): Item[] => {
        // Build ranking deterministically from the bracket tree using recorded winners
        const ranking: Item[] = [];

        const finalRound = rounds[rounds.length - 1];
        const champion = finalRound?.winners?.[0];
        if (champion && !isVirtualItem(champion)) {
            ranking.push(champion);
        }

        // From final round back to first, collect losers per match
        for (let r = rounds.length - 1; r >= 0; r--) {
            const round = rounds[r];
            if (!round) continue;

            // Ensure winners array aligns with matches; skip if no winner recorded (shouldn't happen)
            for (let m = 0; m < round.matches.length; m++) {
                const match = round.matches[m];
                const matchWinner = round.winners[m];
                if (!match || !matchWinner) continue;

                // Determine loser as the non-winner from the match
                const loser = matchWinner.id === match.itemA.id ? match.itemB : match.itemA;
                if (!isVirtualItem(loser)) {
                    ranking.push(loser);
                }
            }
        }

        // Deduplicate, filter to real items that belong to this bracket
        const allowedIds = new Set(tournament.items.map(i => i.id));
        const seen = new Set<number>();
        return ranking.filter(item => {
            if (!item) return false;
            if (isVirtualItem(item)) return false;
            if (!allowedIds.has(item.id)) return false;
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
        });
    };

    const saveTournamentResult = async (completedTournament: ExtendedTournament, displayName?: string, comment?: string) => {
        if (!id) return;

        try {
            const ranking = completedTournament.finalRanking.map(item => item.id);
            const userPart = user?.uid || 'anon';
            const submissionToken = `${id}-${userPart}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

            // Always save to backend (authenticated or not) so comments/results appear globally
            await bracketApi.saveBracketResult(parseInt(id), ranking, submissionToken, displayName, comment);

            // Also save to session memory for anonymous users so they can see their own history locally
            if (!user) {
                addSessionBattle(
                    parseInt(id),
                    completedTournament.bracket.name,
                    ranking,
                    displayName,
                    comment
                );
            }
        } catch (error) {
            console.error('Error saving tournament result:', error);
            // Fallback to session storage if backend fails
            const ranking = completedTournament.finalRanking.map(item => item.id);
            addSessionBattle(
                parseInt(id),
                completedTournament.bracket.name,
                ranking,
                displayName,
                comment
            );
        }
    };



    const handleViewResults = () => {
        navigate(`/results/${id}?fromBattle=true`);
    };

    // Function to auto-resolve bye matches and find the next real match
    const findNextRealMatch = (tourney: ExtendedTournament): ExtendedTournament | null => {
        let currentTourney = { ...tourney };
        let iterations = 0;
        const maxIterations = 1000; // Safety limit

        while (iterations < maxIterations) {
            iterations++;

            // Check if tournament is complete
            if (currentTourney.currentRound >= currentTourney.rounds.length) {
                // Tournament complete
                const finalRanking = createFinalRanking(currentTourney, currentTourney.rounds);
                return {
                    ...currentTourney,
                    currentMatch: null,
                    finalRanking,
                    isComplete: true
                };
            }

            const currentRound = currentTourney.rounds[currentTourney.currentRound];
            if (!currentRound) {
                return null;
            }

            // Check if we've gone through all matches in the current round
            if (currentTourney.currentMatchIndex >= currentRound.matches.length) {
                // Round is complete, move to next round
                const updatedRound = { ...currentRound, isComplete: true };
                const updatedRounds = [...currentTourney.rounds];
                updatedRounds[currentTourney.currentRound] = updatedRound;

                if (currentTourney.currentRound + 1 < currentTourney.rounds.length) {
                    // Update next round's matches with winners
                    const nextRound = { ...updatedRounds[currentTourney.currentRound + 1] };
                    const winners = updatedRound.winners;

                    const updatedMatches = [...nextRound.matches];
                    for (let i = 0; i < updatedMatches.length; i++) {
                        const match = { ...updatedMatches[i] };
                        match.itemA = winners[i * 2];
                        match.itemB = winners[i * 2 + 1];
                        updatedMatches[i] = match;
                    }

                    nextRound.matches = updatedMatches;
                    updatedRounds[currentTourney.currentRound + 1] = nextRound;

                    currentTourney = {
                        ...currentTourney,
                        rounds: updatedRounds,
                        currentRound: currentTourney.currentRound + 1,
                        currentMatchIndex: 0,
                        currentMatch: updatedMatches[0] || null
                    };
                    continue;
                } else {
                    // Tournament complete
                    const finalRanking = createFinalRanking(currentTourney, updatedRounds);
                    return {
                        ...currentTourney,
                        rounds: updatedRounds,
                        currentMatch: null,
                        finalRanking,
                        isComplete: true
                    };
                }
            }

            const currentMatch = currentRound.matches[currentTourney.currentMatchIndex];
            if (!currentMatch) {
                return null;
            }

            // Check if current match has a bye
            if (matchHasBye(currentMatch)) {
                // Auto-resolve this match silently
                const winner = getWinnerOfByeMatch(currentMatch);

                const updatedRound = { ...currentRound };
                updatedRound.winners = [...updatedRound.winners, winner];

                const updatedRounds = [...currentTourney.rounds];
                updatedRounds[currentTourney.currentRound] = updatedRound;

                // Move to next match
                currentTourney = {
                    ...currentTourney,
                    rounds: updatedRounds,
                    currentMatchIndex: currentTourney.currentMatchIndex + 1,
                    currentMatch: currentRound.matches[currentTourney.currentMatchIndex + 1] || null
                };
                continue;
            }

            // Found a real match!
            return currentTourney;
        }

        console.error('findNextRealMatch exceeded max iterations');
        return null;
    };

    const getCurrentMatchDisplay = () => {
        if (!tournament || !tournament.currentMatch) return null;

        const currentRound = tournament.rounds[tournament.currentRound];
        if (!currentRound) return null;

        // Count only real matches (non-bye matches) in the current round
        const realMatches = currentRound.matches.filter(match => !matchHasBye(match));
        const totalRealMatches = realMatches.length;

        // Find the index of the current match among real matches only
        let realMatchIndex = 0;
        for (let i = 0; i <= tournament.currentMatchIndex && i < currentRound.matches.length; i++) {
            const match = currentRound.matches[i];
            if (!matchHasBye(match)) {
                if (i < tournament.currentMatchIndex) {
                    realMatchIndex++;
                } else if (i === tournament.currentMatchIndex) {
                    // Current match - only increment if it's not a bye (it shouldn't be since we skip byes)
                    if (!matchHasBye(tournament.currentMatch)) {
                        realMatchIndex++;
                    }
                }
            }
        }

        // Calculate the "Round of X" based on current round
        const totalRounds = tournament.rounds.length;
        const roundsFromEnd = totalRounds - tournament.currentRound;
        const roundOfValue = Math.pow(2, roundsFromEnd);

        return {
            current: realMatchIndex,
            total: totalRealMatches,
            round: tournament.currentRound + 1,
            matchInRound: realMatchIndex,
            roundOf: roundOfValue
        };
    };

    if (loading) {
        return <PageLoader label="Loading bracket" />;
    }

    if (error) {
        return (
            <div className="page flex min-h-[60vh] flex-col items-start justify-center py-16">
                <h1 className="font-display text-[2.75rem] font-black leading-none">This bracket can’t start</h1>
                <p className="mt-3 max-w-lg text-lg text-themed-secondary">{error}</p>
                <div className="mt-8 flex flex-wrap gap-3">
                    <button onClick={() => navigate('/')} className="btn btn-primary">
                        Go to home
                    </button>
                    <button onClick={() => navigate('/browse')} className="btn btn-secondary">
                        Browse brackets
                    </button>
                </div>
            </div>
        );
    }

    if (selectionPopup) {
        const itemCount = selectionPopup.items.length;
        return (
            <div className="page max-w-3xl pb-24 pt-10 sm:pt-16">
                <p className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-themed-secondary">
                    <TypeIcon type={selectionPopup.bracket.type} />
                    {itemCount} entries in this bracket
                </p>
                <h1 className="font-display text-[3rem] font-black leading-[0.95] text-themed-primary sm:text-[4rem]">
                    {selectionPopup.bracket.name}
                </h1>
                {selectionPopup.bracket.description && (
                    <p className="mt-4 max-w-2xl text-lg text-themed-secondary">{selectionPopup.bracket.description}</p>
                )}

                <fieldset className="mt-10">
                    <legend className="font-display text-2xl font-extrabold text-themed-primary">How many go in?</legend>
                    <p className="mt-1 text-themed-secondary">
                        Bigger brackets take longer and give every entry a fair shot.
                        {selectionPopup.options[0] > itemCount && ' Spare spots become byes, so some entries skip a round.'}
                    </p>
                    <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Bracket size">
                        {selectionPopup.options.map(opt => {
                            const rounds = Math.log2(opt);
                            const hasByes = opt > itemCount;
                            return (
                                <button
                                    key={opt}
                                    type="button"
                                    role="radio"
                                    aria-checked={selectedSize === opt}
                                    onClick={() => {
                                        setSelectedSize(opt);
                                        // Play selection sound
                                        audioRef.current?.playTick(800, 0.1, 0.06);
                                    }}
                                    className="choice px-4 py-3"
                                >
                                    <span className="block font-display text-[1.6rem] font-extrabold leading-none text-themed-primary">
                                        {roundName(opt)}
                                    </span>
                                    <span className="mt-1.5 block text-sm font-medium text-themed-tertiary">
                                        {rounds} {rounds === 1 ? 'round' : 'rounds'}, {opt - 1} {opt - 1 === 1 ? 'match' : 'matches'}
                                        {hasByes && ', with byes'}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </fieldset>

                <div className="mt-8 flex flex-col gap-3 border-t border-themed-primary pt-8 sm:flex-row">
                    <button
                        disabled={!selectedSize}
                        onClick={() => {
                            if (!selectedSize) return;
                            // Play start sound
                            audioRef.current?.playTick(1000, 0.1, 0.08);

                            const newTournament = createTournament(
                                selectionPopup.bracket,
                                [...selectionPopup.items].sort(() => Math.random() - 0.5).slice(0, selectedSize),
                                selectedSize
                            );
                            // Skip any initial bye rounds
                            const tournamentWithRealMatch = findNextRealMatch(newTournament);
                            setTournament(tournamentWithRealMatch || newTournament);
                            setSelectionPopup(null);
                        }}
                        className="btn btn-primary btn-lg sm:min-w-[16rem]"
                    >
                        {selectedSize ? `Start the ${roundName(selectedSize).toLowerCase()}` : 'Pick a size to start'}
                    </button>
                    <button
                        onClick={() => navigate(`/results/${id}`)}
                        className="btn btn-secondary btn-lg"
                    >
                        See results so far
                    </button>
                </div>
            </div>
        );
    }

    if (!tournament) {
        return null;
    }

    if (tournament.isComplete) {
        // Show saving state
        if (isSaving) {
            return <PageLoader label="Saving your result" />;
        }

        const winner = tournament.finalRanking?.[0];
        const formData = completionForm || { displayName: user?.displayName || '', comment: '' };

        const submit = async (withDetails: boolean) => {
            setIsSaving(true);
            if (withDetails) {
                await saveTournamentResult(
                    tournament as ExtendedTournament,
                    formData.displayName.trim() || undefined,
                    formData.comment.trim() || undefined
                );
            } else {
                await saveTournamentResult(tournament as ExtendedTournament);
            }
            setCompletionForm(null);
            setIsSaving(false);
            handleViewResults();
        };

        return (
            <div className="page max-w-2xl pb-24 pt-10 sm:pt-16">
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                >
                    <div
                        className="relative overflow-hidden rounded-lg px-6 py-8 sm:px-8"
                        style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--accent-primary-text)' }}
                    >
                        <svg className="absolute -bottom-6 -right-6 h-36 w-36 opacity-10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M6 1h12v4h4v2a5 5 0 01-5 5h-.4A6 6 0 0113 15.9V19h4v3H7v-3h4v-3.1A6 6 0 017.4 12H7a5 5 0 01-5-5V5h4V1zm0 6H4a3 3 0 002.3 2.9A6 6 0 016 8V7zm12 0v1a6 6 0 01-.3 1.9A3 3 0 0020 7h-2z" />
                        </svg>
                        <p className="relative font-semibold" style={{ color: 'inherit' }}>
                            Your champion of {tournament.bracket.name}
                        </p>
                        <h1 className="relative mt-2 pr-10 font-display text-[2.5rem] font-black leading-[0.95] sm:text-[3.25rem]" style={{ color: 'inherit' }}>
                            {winner ? winner.title : 'Bracket complete'}
                        </h1>
                    </div>

                    <form
                        className="mt-8 space-y-5"
                        onSubmit={(e) => {
                            e.preventDefault();
                            void submit(true);
                        }}
                    >
                        <p className="text-themed-secondary">
                            Add your name and a few words to the results page, or skip straight to the rankings.
                        </p>
                        <div>
                            <label htmlFor="displayName" className="field-label">
                                Your name
                            </label>
                            <input
                                id="displayName"
                                type="text"
                                maxLength={100}
                                value={formData.displayName}
                                onChange={(e) => setCompletionForm(prev => ({ ...(prev || formData), displayName: e.target.value }))}
                                placeholder="Shown next to your comment"
                                className="field"
                            />
                        </div>

                        <div>
                            <div className="flex items-baseline justify-between">
                                <label htmlFor="comment" className="field-label">
                                    Comment <span className="font-normal text-themed-tertiary">(optional)</span>
                                </label>
                                <span className="field-hint tabular">{formData.comment.length}/500</span>
                            </div>
                            <textarea
                                id="comment"
                                maxLength={500}
                                rows={3}
                                value={formData.comment}
                                onChange={(e) => setCompletionForm(prev => ({ ...(prev || formData), comment: e.target.value }))}
                                placeholder="Why did this one win?"
                                className="field resize-none"
                            />
                        </div>

                        <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                            <button type="submit" className="btn btn-primary btn-lg flex-1">
                                Post and see results
                            </button>
                            <button type="button" onClick={() => void submit(false)} className="btn btn-secondary btn-lg">
                                Skip
                            </button>
                        </div>
                    </form>
                </motion.div>
            </div>
        );
    }

    const matchDisplay = getCurrentMatchDisplay();
    const totalMatches = tournament.targetSize - 1;
    const playedMatches = tournament.rounds
        .slice(0, tournament.currentRound + 1)
        .reduce((sum, round) => sum + round.winners.length, 0);

    return (
        <div className="page max-w-6xl pb-16 pt-6 sm:pt-10">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-themed-secondary">{tournament.bracket.name}</p>
                    {matchDisplay && (
                        <h1 className="font-display text-[2.6rem] font-black leading-none text-themed-primary sm:text-[3.25rem]">
                            {roundName(matchDisplay.roundOf)}
                        </h1>
                    )}
                </div>
                {matchDisplay && (
                    <p className="font-display text-2xl font-bold text-themed-secondary tabular">
                        Match {matchDisplay.current} of {matchDisplay.total}
                    </p>
                )}
            </div>

            <div
                className="mb-8 h-1.5 w-full overflow-hidden rounded-full bg-themed-tertiary"
                role="progressbar"
                aria-label="Bracket progress"
                aria-valuemin={0}
                aria-valuemax={totalMatches}
                aria-valuenow={playedMatches}
            >
                <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{
                        width: `${Math.min(100, (playedMatches / Math.max(1, totalMatches)) * 100)}%`,
                        backgroundColor: 'var(--accent-primary)'
                    }}
                />
            </div>

            {tournament.currentMatch && (
                <BattleArena
                    match={tournament.currentMatch}
                    onChoice={handleChoice}
                    winnerAnimation={winnerAnimation}
                />
            )}

            <p className="mt-6 text-center text-sm text-themed-tertiary">
                Press play to preview a clip. Click anywhere else on a card to pick it.
            </p>
        </div>
    );
};

const roundName = (size: number) => {
    if (size === 2) return 'Final';
    if (size === 4) return 'Semifinals';
    if (size === 8) return 'Quarterfinals';
    return `Round of ${size}`;
};

const BattleArena: React.FC<{
    match: BracketMatch;
    onChoice: (item: Item) => void;
    winnerAnimation: {
        winnerId: number;
        loserId: number;
    } | null;
}> = ({ match, onChoice, winnerAnimation }) => {
    return (
        <div className="relative grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-6">
            <BattleItem
                item={match.itemA}
                onSelect={() => onChoice(match.itemA)}
                side="left"
                winnerAnimation={winnerAnimation}
            />
            {/* Stacked layout: VS sits in the flow between the cards */}
            <div className="flex items-center justify-center md:hidden" aria-hidden="true">
                <span className="font-display text-[1.9rem] font-black italic leading-none text-themed-primary">VS</span>
            </div>
            <BattleItem
                item={match.itemB}
                onSelect={() => onChoice(match.itemB)}
                side="right"
                winnerAnimation={winnerAnimation}
            />
            <div
                className="pointer-events-none absolute left-1/2 top-1/2 z-10 hidden h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full md:flex"
                style={{ backgroundColor: 'var(--bg-primary)', boxShadow: '0 0 0 6px var(--bg-primary)' }}
                aria-hidden="true"
            >
                <span className="font-display text-[2.2rem] font-black italic leading-none text-themed-primary">VS</span>
            </div>
        </div>
    );
};

const BattleItem: React.FC<{
    item: Item;
    onSelect: () => void;
    side: 'left' | 'right';
    winnerAnimation?: {
        winnerId: number;
        loserId: number;
    } | null;
}> = ({ item, onSelect, side, winnerAnimation }) => {
    const isWinner = winnerAnimation && item.id === winnerAnimation.winnerId;
    const isLoser = winnerAnimation && item.id === winnerAnimation.loserId;
    const isAnimating = winnerAnimation !== null;
    const canPick = !isAnimating && item.mediaType !== 'bye';
    const sideColor = side === 'left' ? 'var(--side-a)' : 'var(--side-b)';

    const handleClick = () => {
        if (canPick) {
            onSelect();
        }
    };

    return (
        <motion.div
            initial={{ x: side === 'left' ? -40 : 40, opacity: 0 }}
            animate={{
                x: 0,
                opacity: isLoser ? 0.55 : 1,
                scale: isWinner ? 1.02 : isLoser ? 0.97 : 1,
            }}
            transition={{
                duration: 0.4,
                scale: { duration: 0.3 },
                opacity: { duration: 0.3 }
            }}
            className="relative"
        >
            <div
                onClick={handleClick}
                onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleClick();
                    }
                }}
                role="button"
                tabIndex={canPick ? 0 : -1}
                aria-disabled={!canPick}
                aria-label={`Pick ${item.title}`}
                className={`group card relative flex min-h-[24rem] flex-col overflow-hidden border-2 transition-colors duration-200 sm:min-h-[30rem] ${
                    canPick ? 'cursor-pointer' : 'cursor-default'
                }`}
                style={{
                    borderColor: isWinner ? 'var(--accent-primary)' : undefined,
                    borderTopColor: isWinner ? 'var(--accent-primary)' : sideColor,
                    borderTopWidth: 6,
                }}
            >
                <div className="flex min-h-0 flex-1 items-center justify-center p-5 sm:p-6">
                    <div className="w-full max-w-md">
                        <MediaPreview item={item} />
                    </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-4 border-t border-themed-primary px-5 py-4 sm:px-6">
                    <div className="min-w-0 flex-1">
                        <h2 className="font-display text-[1.75rem] font-extrabold leading-[1.05] text-themed-primary line-clamp-2">
                            {item.title}
                        </h2>
                        {(isWinner || isLoser || item.mediaType === 'bye') && (
                            <p className="mt-1 text-sm font-semibold" style={{ color: isWinner ? 'var(--accent-ink)' : 'var(--text-tertiary)' }}>
                                {item.mediaType === 'bye'
                                    ? 'Advances automatically'
                                    : isWinner
                                        ? 'Through to the next round'
                                        : 'Knocked out'}
                            </p>
                        )}
                    </div>
                    {canPick && (
                        <span
                            className="pick-chip shrink-0 rounded-md border px-4 py-2 font-semibold"
                            style={{ '--side': sideColor } as React.CSSProperties}
                            aria-hidden="true"
                        >
                            Pick
                        </span>
                    )}
                </div>

                {/* Hover wash in the side's colour */}
                {canPick && (
                    <div
                        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-[0.07] group-focus-visible:opacity-[0.07]"
                        style={{ backgroundColor: sideColor }}
                    />
                )}

                {isWinner && (
                    <>
                        {/* Celebration confetti */}
                        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
                            {[...Array(12)].map((_, i) => (
                                <motion.div
                                    key={i}
                                    className="absolute h-2.5 w-2.5 rounded-sm"
                                    style={{ backgroundColor: i % 3 === 0 ? sideColor : 'var(--accent-primary)' }}
                                    initial={{ x: '50%', y: '50%', scale: 0, opacity: 1 }}
                                    animate={{
                                        x: `${50 + (Math.random() - 0.5) * 200}%`,
                                        y: `${50 + (Math.random() - 0.5) * 200}%`,
                                        scale: [0, 1, 0],
                                        opacity: [1, 1, 0],
                                        rotate: Math.random() * 360
                                    }}
                                    transition={{ duration: 1.5, delay: i * 0.08, ease: 'easeOut' }}
                                />
                            ))}
                        </div>
                        <motion.div
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.15, duration: 0.4, type: 'spring' }}
                            className="absolute left-4 top-4 z-10 rounded-md px-3 py-1.5 font-display text-lg font-extrabold"
                            style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--accent-primary-text)' }}
                        >
                            Winner
                        </motion.div>
                    </>
                )}

                {isLoser && (
                    <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.15, duration: 0.3 }}
                        className="absolute right-4 top-4 z-10 rounded-md bg-themed-tertiary px-3 py-1.5 font-display text-lg font-extrabold text-themed-secondary"
                    >
                        Out
                    </motion.div>
                )}
            </div>
        </motion.div>
    );
};

export default BracketPage;
