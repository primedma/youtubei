import { getContinuationFromItems, mapFilter, stripToInt, YoutubeRawData } from "../common";
import { Base, PlaylistCompact, Thumbnails, VideoCompact, BaseAttributes } from ".";
import { I_END_POINT } from "../constants";

/** @hidden */
export interface ChannelCompactAttributes extends BaseAttributes {
	name: string;
	thumbnails?: Thumbnails;
	videoCount?: number;
	subscriberCount?: string;
	videoContinuation?: string | null;
	playlistContinuation?: string | null;
}

/**  Represents a Youtube Channel */
export default class ChannelCompact extends Base implements ChannelCompactAttributes {
	/** The channel's name */
	name!: string;
	/** Thumbnails of the Channel with different sizes */
	thumbnails?: Thumbnails;
	/** How many video does this channel have */
	videoCount?: number;
	/**
	 * How many subscriber does this channel have,
	 *
	 * This is not the exact amount, but a literal string like `"1.95M subscribers"`
	 */
	subscriberCount?: string;
	/** Loaded videos on the channel, fetched from `channel.nextVideos()` */
	videos: VideoCompact[] = [];
	/** Loaded playlists on the channel, fetched from `channel.nextPlaylists()` */
	playlists: PlaylistCompact[] = [];
	/** Current continuation token to load next videos */
	videoContinuation?: string | null = null;
	/** Current continuation token to load next playlists */
	playlistContinuation?: string | null = null;

	/** @hidden */
	constructor(channel: Partial<ChannelCompactAttributes> = {}) {
		super();
		Object.assign(this, channel);
	}

	/** The URL of the channel page */
	get url(): string {
		return `https://www.youtube.com/channel/${this.id}`;
	}

	/**
	 * Load this instance with raw data from Youtube
	 *
	 * @hidden
	 */
	load(data: YoutubeRawData): ChannelCompact {
		const { channelId, title, thumbnail, videoCountText, subscriberCountText } = data;

		this.id = channelId;
		this.name = title.simpleText;
		this.thumbnails = new Thumbnails().load(thumbnail.thumbnails);
		this.videoCount = stripToInt(videoCountText?.runs[0].text) || 0;
		this.subscriberCount = subscriberCountText?.simpleText;
		this.videos = [];
		this.playlists = [];

		return this;
	}

	/**
	 * Load next 30 videos made by the channel, and push the loaded videos to {@link Channel.videos}
	 *
	 * @example
	 * ```js
	 * const channel = await youtube.findOne(CHANNEL_NAME, {type: "channel"});
	 * await channel.nextVideos();
	 * console.log(channel.videos) // first 30 videos
	 *
	 * let newVideos = await channel.nextVideos();
	 * console.log(newVideos) // 30 loaded videos
	 * console.log(channel.videos) // first 60 videos
	 *
	 * await channel.nextVideos(0); // load the rest of the videos in the channel
	 * ```
	 *
	 * @param count How many time to load the next videos, pass `0` to load all
	 *
	 * @return New loaded videos
	 */
	async nextVideos(count = 1): Promise<VideoCompact[]> {
		const newVideos: VideoCompact[] = [];
		for (let i = 0; i < count || count == 0; i++) {
			if (this.videoContinuation === undefined) break;

			const items = await this.getTabData("videos");

			this.videoContinuation = getContinuationFromItems(items);

			const videos = mapFilter(items, "gridVideoRenderer");
			newVideos.push(
				...videos.map((i: YoutubeRawData) =>
					new VideoCompact({ client: this.client }).load(i)
				)
			);
		}

		this.videos.push(...newVideos);
		return newVideos;
	}

	/**
	 * Load next 30 playlists made by the channel, and push the loaded playlists to {@link Channel.playlists}
	 *
	 * @example
	 * ```js
	 * const channel = await youtube.findOne(CHANNEL_NAME, {type: "channel"});
	 * await channel.nextPlaylists();
	 * console.log(channel.playlists) // first 30 playlists
	 *
	 * let newPlaylists = await channel.nextPlaylists();
	 * console.log(newPlaylists) // 30 loaded playlists
	 * console.log(channel.playlists) // first 60 playlists
	 *
	 * await channel.nextPlaylists(0); // load the rest of the playlists in the channel
	 * ```
	 *
	 * @param count How many time to load the next playlists, pass `0` to load all
	 *
	 * @return New loaded playlists
	 */
	async nextPlaylists(count = 1): Promise<PlaylistCompact[]> {
		const newPlaylists: PlaylistCompact[] = [];
		for (let i = 0; i < count || count == 0; i++) {
			if (this.playlistContinuation === undefined) break;

			const items = await this.getTabData("playlists");
			this.playlistContinuation = getContinuationFromItems(items);

			const playlists = mapFilter(items, "gridPlaylistRenderer");

			newPlaylists.push(
				...playlists.map((i: YoutubeRawData) =>
					new PlaylistCompact({ client: this.client }).load(i)
				)
			);
		}

		this.playlists.push(...newPlaylists);
		return newPlaylists;
	}

	/** Get tab data from youtube */
	private async getTabData(name: "videos" | "playlists") {
		const params = name === "videos" ? "EgZ2aWRlb3M%3D" : "EglwbGF5bGlzdHMgAQ%3D%3D";
		const continuation = name === "videos" ? this.videoContinuation : this.playlistContinuation;

		const response = await this.client.http.post(`${I_END_POINT}/browse`, {
			data: { browseId: this.id, params, continuation },
		});

		return ChannelCompact.parseTabData(name, response.data);
	}

	/** Parse tab data from request, tab name is ignored if it's a continuation data */
	private static parseTabData(
		name: "videos" | "playlists",
		data: YoutubeRawData
	): YoutubeRawData {
		const index = name === "videos" ? 1 : 2;
		return (
			data.contents?.twoColumnBrowseResultsRenderer?.tabs[index]?.tabRenderer?.content?.sectionListRenderer.contents[0].itemSectionRenderer.contents[0].gridRenderer
				.items ||
			data.onResponseReceivedActions[0].appendContinuationItemsAction.continuationItems
		);
	}
}
