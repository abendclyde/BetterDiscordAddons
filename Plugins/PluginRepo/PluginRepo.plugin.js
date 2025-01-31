/**
 * @name PluginRepo
 * @author DevilBro
 * @authorId 278543574059057154
 * @version 2.1.7
 * @description Allows you to look at all Plugins from the Plugin Repo and download them on the fly
 * @invite Jx3TjNS
 * @donate https://www.paypal.me/MircoWittrien
 * @patreon https://www.patreon.com/MircoWittrien
 * @website https://mwittrien.github.io/
 * @source https://github.com/mwittrien/BetterDiscordAddons/tree/master/Plugins/PluginRepo/
 * @updateUrl https://mwittrien.github.io/BetterDiscordAddons/Plugins/PluginRepo/PluginRepo.plugin.js
 */

module.exports = (_ => {
	const config = {
		"info": {
			"name": "PluginRepo",
			"author": "DevilBro",
			"version": "2.1.7",
			"description": "Allows you to look at all Plugins from the Plugin Repo and download them on the fly"
		}
	};

	return !window.BDFDB_Global || (!window.BDFDB_Global.loaded && !window.BDFDB_Global.started) ? class {
		getName () {return config.info.name;}
		getAuthor () {return config.info.author;}
		getVersion () {return config.info.version;}
		getDescription () {return `The Library Plugin needed for ${config.info.name} is missing. Open the Plugin Settings to download it. \n\n${config.info.description}`;}
		
		downloadLibrary () {
			require("request").get("https://mwittrien.github.io/BetterDiscordAddons/Library/0BDFDB.plugin.js", (e, r, b) => {
				if (!e && b && r.statusCode == 200) require("fs").writeFile(require("path").join(BdApi.Plugins.folder, "0BDFDB.plugin.js"), b, _ => BdApi.showToast("Finished downloading BDFDB Library", {type: "success"}));
				else BdApi.alert("Error", "Could not download BDFDB Library Plugin. Try again later or download it manually from GitHub: https://mwittrien.github.io/downloader/?library");
			});
		}
		
		load () {
			if (!window.BDFDB_Global || !Array.isArray(window.BDFDB_Global.pluginQueue)) window.BDFDB_Global = Object.assign({}, window.BDFDB_Global, {pluginQueue: []});
			if (!window.BDFDB_Global.downloadModal) {
				window.BDFDB_Global.downloadModal = true;
				BdApi.showConfirmationModal("Library Missing", `The Library Plugin needed for ${config.info.name} is missing. Please click "Download Now" to install it.`, {
					confirmText: "Download Now",
					cancelText: "Cancel",
					onCancel: _ => {delete window.BDFDB_Global.downloadModal;},
					onConfirm: _ => {
						delete window.BDFDB_Global.downloadModal;
						this.downloadLibrary();
					}
				});
			}
			if (!window.BDFDB_Global.pluginQueue.includes(config.info.name)) window.BDFDB_Global.pluginQueue.push(config.info.name);
		}
		start () {this.load();}
		stop () {}
		getSettingsPanel () {
			let template = document.createElement("template");
			template.innerHTML = `<div style="color: var(--header-primary); font-size: 16px; font-weight: 300; white-space: pre; line-height: 22px;">The Library Plugin needed for ${config.info.name} is missing.\nPlease click <a style="font-weight: 500;">Download Now</a> to install it.</div>`;
			template.content.firstElementChild.querySelector("a").addEventListener("click", this.downloadLibrary);
			return template.content.firstElementChild;
		}
	} : (([Plugin, BDFDB]) => {
		const isBeta = !(window.BdApi && !Array.isArray(BdApi.settings));
		var _this;
		var loading, cachedPlugins, grabbedPlugins, foundPlugins, loadedPlugins, updateInterval;
		var list, header, searchTimeout, forcedSort, forcedOrder, showOnlyOutdated;
		var settings = {}, modalSettings = {}, favorites = [], customList = [];
		
		const pluginStates = {
			UPDATED: 0,
			OUTDATED: 1,
			DOWNLOADABLE: 2
		};
		const buttonData = {
			UPDATED: {
				colorClass: "GREEN",
				backgroundColor: "STATUS_GREEN",
				icon: "CHECKMARK",
				text: "updated"
			},
			OUTDATED: {
				colorClass: "RED",
				backgroundColor: "STATUS_RED",
				icon: "CLOSE",
				text: "outdated"
			},
			DOWNLOADABLE: {
				colorClass: "BRAND",
				backgroundColor: "var(--bdfdb-blurple)",
				icon: "DOWNLOAD",
				text: "download"
			}
		};
		const favStates = {
			FAVORIZED: 0,
			NOT_FAVORIZED: 1
		};
		const newStates = {
			NEW: 0,
			NOT_NEW: 1
		};
		const sortKeys = {
			NAME:			"Name",
			AUTHOR:			"Author",
			VERSION:		"Version",
			DESCRIPTION:	"Description",
			STATE:			"Update State",
			FAV:			"Favorites",
			NEW:			"New Plugins"
		};
		const orderKeys = {
			ASC:			"ascending",
			DESC:			"descending"
		};
		
		const pluginRepoIcon = `<svg width="37" height="32" viewBox="0 0 37 32"><path fill="COLOR_1" d="m 0,0 v 32 h 8.1672381 v -9.355469 h 4.7914989 c 7.802754,0 11.77368,-5.650788 11.77368,-11.345703 C 24.732417,5.6491106 20.8074,0 12.913386,0 Z m 8.1672381,7.5488281 h 4.7461479 c 4.928055,-0.045198 4.928055,7.9534009 0,7.9082029 H 8.1672381 Z"/><path fill="COLOR_2" d="M 23.173828 0 C 26.168987 2.3031072 27.920961 5.6614952 28.433594 9.2128906 C 29.159183 10.362444 29.181906 11.885963 28.511719 13.064453 C 28.098967 17.002739 26.191156 20.761973 22.810547 23.197266 L 29.287109 32 L 37 32 L 37 28.941406 L 30.65625 21.017578 C 34.580442 19.797239 37 16.452154 37 10.53125 C 36.81748 3.0284249 31.662 0 25 0 L 23.173828 0 z M 20.34375 24.603516 C 18.404231 25.464995 16.135462 25.970703 13.521484 25.970703 L 12.085938 25.970703 L 12.085938 32 L 20.34375 32 L 20.34375 24.603516 z"/></svg>`;
		
		const RepoListComponent = class PluginList extends BdApi.React.Component {
			componentDidMount() {
				list = this;
				BDFDB.TimeUtils.timeout(_ => {
					forcedSort = null;
					forcedOrder = null;
					showOnlyOutdated = false;
				}, 5000);
			}
			componentWillUnmount() {
				list = null;
			}
			filterPlugins() {
				let plugins = Object.keys(loadedPlugins).map(url => {
					let plugin = loadedPlugins[url];
					let instPlugin = BDFDB.BDUtils.getPlugin(plugin.getName);
					if (instPlugin && typeof instPlugin.getAuthor == "function" && _this.getString(instPlugin.getAuthor()).toUpperCase() == plugin.getAuthor.toUpperCase()) plugin.getState = _this.getString(instPlugin.getVersion()) != plugin.getVersion ? pluginStates.OUTDATED : pluginStates.UPDATED;
					else plugin.getState = pluginStates.DOWNLOADABLE;
					return {
						url: plugin.url,
						search: (plugin.getName + " " + plugin.getVersion + " " + plugin.getAuthor + " " + plugin.getDescription).toUpperCase(),
						name: plugin.getName,
						version: plugin.getVersion,
						author: plugin.getAuthor,
						description: plugin.getDescription || "No Description found",
						fav: favorites.includes(url) ? favStates.FAVORIZED : favStates.NOT_FAVORIZED,
						new: plugin.getState == pluginStates.DOWNLOADABLE && !cachedPlugins.includes(url) ? newStates.NEW : newStates.NOT_NEW,
						state: plugin.getState
					};
				});
				if (!this.props.updated)		plugins = plugins.filter(plugin => plugin.state != pluginStates.UPDATED);
				if (!this.props.outdated)		plugins = plugins.filter(plugin => plugin.state != pluginStates.OUTDATED);
				if (!this.props.downloadable)	plugins = plugins.filter(plugin => plugin.state != pluginStates.DOWNLOADABLE);
				if (this.props.searchString) 	{
					let searchString = this.props.searchString.toUpperCase();
					plugins = plugins.filter(plugin => plugin.search.indexOf(searchString) > -1);
				}

				BDFDB.ArrayUtils.keySort(plugins, (!this.props.sortKey || this.props.sortKey == "NEW" && !plugins.some(plugin => plugin.new == newStates.NEW) ? Object.keys(sortKeys)[0] : this.props.sortKey).toLowerCase());
				if (this.props.orderKey == "DESC") plugins.reverse();
				return plugins;
			}
			render() {
				let automaticLoading = BDFDB.BDUtils.getSettings(BDFDB.BDUtils.settingsIds.automaticLoading);
				if (!this.props.tab) this.props.tab = "Plugins";
				this.props.entries = (!loading.is && !BDFDB.ObjectUtils.isEmpty(loadedPlugins) ? this.filterPlugins() : []).map(plugin => BDFDB.ReactUtils.createElement(RepoCardComponent, {
					plugin: plugin
				})).filter(n => n);
				
				BDFDB.TimeUtils.timeout(_ => {
					if (!loading.is && header && this.props.entries.length != header.props.amount) {
						header.props.amount = this.props.entries.length;
						BDFDB.ReactUtils.forceUpdate(header);
					}
				});
				
				return [
					BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.ModalComponents.ModalTabContent, {
						tab: "Plugins",
						open: this.props.tab == "Plugins",
						render: false,
						children: loading.is ? BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex, {
							direction: BDFDB.LibraryComponents.Flex.Direction.VERTICAL,
							justify: BDFDB.LibraryComponents.Flex.Justify.CENTER,
							style: {marginTop: "50%"},
							children: [
								BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Spinner, {
									type: BDFDB.LibraryComponents.Spinner.Type.WANDERING_CUBES
								}),
								BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TextElement, {
									className: BDFDB.disCN.margintop20,
									style: {textAlign: "center"},
									children: `${BDFDB.LanguageUtils.LibraryStringsFormat("loading", "Plugin Repo")} - ${BDFDB.LanguageUtils.LibraryStrings.please_wait}`
								})
							]
						}) : BDFDB.ReactUtils.forceStyle(BDFDB.ReactUtils.createElement("div", {
							className: BDFDB.disCN._repolist,
							style: {
								display: "flex",
								flexDirection: "column",
								margin: "unset",
								width: "unset"
							},
							children: this.props.entries
						}), ["display", "flex-direction", "margin", "width"])
					}),
					BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.ModalComponents.ModalTabContent, {
						tab: BDFDB.LanguageUtils.LanguageStrings.SETTINGS,
						open: this.props.tab == BDFDB.LanguageUtils.LanguageStrings.SETTINGS,
						render: false,
						children: [
							!automaticLoading && BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex, {
								className: BDFDB.disCN.marginbottom20,
								children: BDFDB.ReactUtils.createElement("div", {
									className: BDFDB.disCNS.settingsrowtitle + BDFDB.disCNS.settingsrowtitledefault + BDFDB.disCN.cursordefault,
									children: "To experience Plugin Repo in the best way. I would recommend you to enable BD intern reload function, that way all downloaded files are loaded into Discord without the need to reload."
								})
							}),
							Object.keys(modalSettings).map(key => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsSaveItem, {
								className: BDFDB.disCN.marginbottom20,
								type: "Switch",
								plugin: _this,
								keys: ["modalSettings", key],
								label: _this.defaults.modalSettings[key].description,
								note: key == "rnmStart" && !automaticLoading && "Automatic Loading has to be enabled",
								disabled: key == "rnmStart" && !automaticLoading,
								value: this.props[key],
								onChange: (value, instance) => {
									this.props[key] = modalSettings[key] = value;
									BDFDB.ReactUtils.forceUpdate(this);
								}
							}))
						].flat(10).filter(n => n)
					})
				];
			}
		};
		
		const RepoCardComponent = class PluginCard extends BdApi.React.Component {
			render() {
				let buttonConfig = buttonData[(Object.entries(pluginStates).find(n => n[1] == this.props.plugin.state) || [])[0]];
				return buttonConfig && BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.AddonCard, {
					icon: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SvgIcon, {
						className: BDFDB.disCN._repoicon,
						nativeClass: true,
						iconSVG: `<svg viewBox="0 0 24 24" fill="#FFFFFF" style="width: 18px; height: 18px;"><path d="M0 0h24v24H0z" fill="none"></path><path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z"></path></svg>`
					}),
					data: this.props.plugin,
					controls: [
						this.props.plugin.new == newStates.NEW && BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Badges.TextBadge, {
							style: {
								borderRadius: 3,
								textTransform: "uppercase",
								background: BDFDB.DiscordConstants.Colors.STATUS_YELLOW
							},
							text: BDFDB.LanguageUtils.LanguageStrings.NEW
						}),
						BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FavButton, {
							className: BDFDB.disCN._repocontrolsbutton,
							isFavorite: this.props.plugin.fav == favStates.FAVORIZED,
							onClick: value => {
								this.props.plugin.fav = value ? favStates.FAVORIZED : favStates.NOT_FAVORIZED;
								if (value) favorites.push(this.props.plugin.url);
								else BDFDB.ArrayUtils.remove(favorites, this.props.plugin.url, true);
								BDFDB.DataUtils.save(favorites, _this, "favorites");
							}
						}),
						!isBeta && BDFDB.ReactUtils.createElement("div", {
							className: BDFDB.disCN._repocontrolsbutton,
							children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TooltipContainer, {
								text: "Go to Source",
								children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SvgIcon, {
									name: BDFDB.LibraryComponents.SvgIcon.Names.GITHUB,
									className: BDFDB.disCN._repoicon,
									onClick: _ => {
										let gitUrl = null;
										if (this.props.plugin.url.indexOf("https://raw.githubusercontent.com") == 0) {
											let temp = this.props.plugin.url.replace("//raw.githubusercontent", "//github").split("/");
											temp.splice(5, 0, "blob");
											gitUrl = temp.join("/");
										}
										else if (this.props.plugin.url.indexOf("https://gist.githubusercontent.com/") == 0) {
											gitUrl = this.props.plugin.url.replace("//gist.githubusercontent", "//gist.github").split("/raw/")[0];
										}
										if (gitUrl) BDFDB.DiscordUtils.openLink(gitUrl);
									}
								})
							})
						})
					],
					links: isBeta && [{
						label: "Source",
						icon: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SvgIcon, {
							name: BDFDB.LibraryComponents.SvgIcon.Names.GITHUB,
							nativeClass: true,
							width: 18,
							height: 18
						}),
						onClick: _ => {
							let gitUrl = null;
							if (this.props.plugin.url.indexOf("https://raw.githubusercontent.com") == 0) {
								let temp = this.props.plugin.url.replace("//raw.githubusercontent", "//github").split("/");
								temp.splice(5, 0, "blob");
								gitUrl = temp.join("/");
							}
							else if (this.props.plugin.url.indexOf("https://gist.githubusercontent.com/") == 0) {
								gitUrl = this.props.plugin.url.replace("//gist.githubusercontent", "//gist.github").split("/raw/")[0];
							}
							if (gitUrl) BDFDB.DiscordUtils.openLink(gitUrl);
						}
					}],
					buttons: isBeta ? [
						this.props.plugin.state != pluginStates.DOWNLOADABLE && BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TooltipContainer, {
							text: BDFDB.LanguageUtils.LanguageStrings.DELETE,
							children: BDFDB.ReactUtils.createElement("div", {
								className: BDFDB.disCNS._repobutton + BDFDB.disCNS._repocontrolsbutton + BDFDB.disCN._repobuttondanger,
								onClick: _ => {
									_this.stopPlugin(this.props.plugin);
									_this.deletePluginFile(this.props.plugin);
									this.props.plugin.state = pluginStates.DOWNLOADABLE;
									BDFDB.ReactUtils.forceUpdate(this);
								},
								children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SvgIcon, {
									name: BDFDB.LibraryComponents.SvgIcon.Names.TRASH,
									nativeClass: true,
									color: "#FFFFFF",
									width: 20,
									height: 20
								})
							})
						}),
						BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TooltipContainer, {
							text: BDFDB.LanguageUtils.LibraryStrings[buttonConfig.text],
							children: BDFDB.ReactUtils.createElement("div", {
								className: BDFDB.disCNS._repobutton + BDFDB.disCN._repocontrolsbutton,
								style: {backgroundColor: BDFDB.DiscordConstants.Colors[buttonConfig.backgroundColor] || buttonConfig.backgroundColor},
								onClick: _ => {
									_this.downloadPlugin(this.props.plugin);
									if (list && list.props.rnmStart) BDFDB.TimeUtils.timeout(_ => {
										if (this.props.plugin.state == pluginStates.UPDATED) _this.startPlugin(this.props.plugin);
									}, 3000);
									this.props.plugin.state = pluginStates.UPDATED;
									BDFDB.ReactUtils.forceUpdate(this);
								},
								children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SvgIcon, {
									name: BDFDB.LibraryComponents.SvgIcon.Names[buttonConfig.icon],
									nativeClass: true,
									color: "#FFFFFF",
									width: 20,
									height: 20
								})
							})
						})
					] : [
						this.props.plugin.state != pluginStates.DOWNLOADABLE && BDFDB.ReactUtils.createElement("div", {
							className: BDFDB.disCN._repocontrolsbutton,
							children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TooltipContainer, {
								text: BDFDB.LanguageUtils.LanguageStrings.DELETE,
								children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SvgIcon, {
									name: BDFDB.LibraryComponents.SvgIcon.Names.NOVA_TRASH,
									className: BDFDB.disCN._repoicon,
									onClick: (e, instance) => {
										_this.stopPlugin(this.props.plugin);
										_this.deletePluginFile(this.props.plugin);
										this.props.plugin.state = pluginStates.DOWNLOADABLE;
										BDFDB.ReactUtils.forceUpdate(this);
									}
								})
							})
						}),
						BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Button, {
							size: BDFDB.LibraryComponents.Button.Sizes.MIN,
							color: BDFDB.LibraryComponents.Button.Colors[buttonConfig.colorClass],
							style: {backgroundColor: BDFDB.DiscordConstants.Colors[buttonConfig.backgroundColor] || buttonConfig.backgroundColor},
							children: BDFDB.LanguageUtils.LibraryStrings[buttonConfig.text],
							onClick: (e, instance) => {
								_this.downloadPlugin(this.props.plugin);
								if (list && list.props.rnmStart) BDFDB.TimeUtils.timeout(_ => {
									if (this.props.plugin.state == pluginStates.UPDATED) _this.startPlugin(this.props.plugin);
								}, 3000);
								this.props.plugin.state = pluginStates.UPDATED;
								BDFDB.ReactUtils.forceUpdate(this);
							}
						})
					]
				});
			}
		};
		
		const RepoListHeaderComponent = class PluginListHeader extends BdApi.React.Component {
			componentDidMount() {
				header = this;
			}
			render() {
				if (!this.props.tab) this.props.tab = "Plugins";
				return BDFDB.ReactUtils.createElement("div", {
					className: BDFDB.disCN._repolistheader,
					children: [
						BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex, {
							className: BDFDB.disCN.marginbottom4,
							align: BDFDB.LibraryComponents.Flex.Align.CENTER,
							children: [
								BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex.Child, {
									grow: 1,
									shrink: 0,
									children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormComponents.FormTitle, {
										tag: BDFDB.LibraryComponents.FormComponents.FormTitle.Tags.H2,
										className: BDFDB.disCN.marginreset,
										children: `Plugin Repo — ${loading.is ? 0 : this.props.amount || 0}/${loading.is ? 0 : Object.keys(loadedPlugins).length}`
									})
								}),
								BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex.Child, {
									children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SearchBar, {
										autoFocus: true,
										query: this.props.searchString,
										onChange: (value, instance) => {
											if (loading.is) return;
											BDFDB.TimeUtils.clear(searchTimeout);
											searchTimeout = BDFDB.TimeUtils.timeout(_ => {
												this.props.searchString = list.props.searchString = value.replace(/[<|>]/g, "");
												BDFDB.ReactUtils.forceUpdate(this, list);
											}, 1000);
										},
										onClear: instance => {
											if (loading.is) return;
											this.props.searchString = list.props.searchString = "";
											BDFDB.ReactUtils.forceUpdate(this, list);
										}
									})
								}),
								BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Button, {
									size: BDFDB.LibraryComponents.Button.Sizes.TINY,
									children: BDFDB.LanguageUtils.LibraryStrings.check_for_updates,
									onClick: _ => {
										if (loading.is) return;
										loading = {is: false, timeout: null, amount: 0};
										_this.loadPlugins();
									}
								})
							]
						}),
						BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex, {
							className: BDFDB.disCNS.tabbarcontainer + BDFDB.disCN.tabbarcontainerbottom,
							align: BDFDB.LibraryComponents.Flex.Align.CENTER,
							children: [
								BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex.Child, {
									children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TabBar, {
										className: BDFDB.disCN.tabbar,
										itemClassName: BDFDB.disCN.tabbaritem,
										type: BDFDB.LibraryComponents.TabBar.Types.TOP,
										selectedItem: this.props.tab,
										items: [{value: "Plugins"}, {value: BDFDB.LanguageUtils.LanguageStrings.SETTINGS}],
										onItemSelect: (value, instance) => {
											this.props.tab = list.props.tab = value;
											BDFDB.ReactUtils.forceUpdate(list);
										}
									})
								}),
								BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex.Child, {
									children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.QuickSelect, {
										label: BDFDB.LanguageUtils.LibraryStrings.sort_by + ":",
										value: {
											label: sortKeys[this.props.sortKey],
											value: this.props.sortKey
										},
										options: Object.keys(sortKeys).filter(n => n != "NEW" || Object.keys(loadedPlugins).some(p => !cachedPlugins.includes(p))).map(key => ({
											label: sortKeys[key],
											value: key
										})),
										onChange: (key, instance) => {
											this.props.sortKey = list.props.sortKey = key;
											BDFDB.ReactUtils.forceUpdate(this, list);
										}
									})
								}),
								BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex.Child, {
									children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.QuickSelect, {
										label: BDFDB.LanguageUtils.LibraryStrings.order + ":",
										value: {
											label: BDFDB.LanguageUtils.LibraryStrings[orderKeys[this.props.orderKey]],
											value: this.props.orderKey
										},
										options: Object.keys(orderKeys).map(key => ({
											label: BDFDB.LanguageUtils.LibraryStrings[orderKeys[key]],
											value: key
										})),
										onChange: (key, instance) => {
											this.props.orderKey = list.props.orderKey = key;
											BDFDB.ReactUtils.forceUpdate(this, list);
										}
									})
								})
							]
						})
					]
				});
			}
		};
	
		return class PluginRepo extends Plugin {
			onLoad () {
				_this = this;
				
				loading = {is: false, timeout: null, amount: 0};

				cachedPlugins = [];
				grabbedPlugins = [];
				foundPlugins = [];
				loadedPlugins = {};

				this.defaults = {
					settings: {
						notifyOutdated:		{value: true, 	description: "Get a Notification when one of your Plugins is outdated"},
						notifyNewEntries:	{value: true, 	description: "Get a Notification when there are new Entries in the Repo"}
					},
					modalSettings: {
						updated: 			{value: true,	modify: true,	description: "Show updated Plugins",},
						outdated:			{value: true, 	modify: true,	description: "Show outdated Plugins"},
						downloadable:		{value: true, 	modify: true,	description: "Show downloadable Plugins"},
						rnmStart:			{value: true, 	modify: false,	description: "Start Plugin after Download"}
					}
				};
			
				this.patchedModules = {
					before: {
						SettingsView: "render"
					},
					after: {
						StandardSidebarView: "render"
					}
				};
				
			}
			
			onStart () {
				this.forceUpdateAll();

				this.loadPlugins();

				updateInterval = BDFDB.TimeUtils.interval(_ => {this.checkForNewPlugins();}, 1000*60*30);
			}
			
			onStop () {
				BDFDB.TimeUtils.clear(updateInterval);
				BDFDB.TimeUtils.clear(loading.timeout);

				this.forceUpdateAll();

				BDFDB.DOMUtils.remove(BDFDB.dotCN._pluginreponotice, BDFDB.dotCN._pluginrepoloadingicon);
			}

			getSettingsPanel (collapseStates = {}) {
				let customUrl = "";
				let settingsPanel, settingsItems = [];
				
				settingsItems.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.CollapseContainer, {
					title: "Settings",
					collapseStates: collapseStates,
					children: Object.keys(settings).map(key => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsSaveItem, {
						type: "Switch",
						plugin: this,
						keys: ["settings", key],
						label: this.defaults.settings[key].description,
						value: settings[key]
					}))
				}));
				settingsItems.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.CollapseContainer, {
					title: "Custom Plugins",
					collapseStates: collapseStates,
					children: [
						BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormComponents.FormItem, {
							title: "Add Plugin:",
							tag: BDFDB.LibraryComponents.FormComponents.FormTitleTags.H3,
							className: BDFDB.disCNS.margintop4 + BDFDB.disCN.marginbottom8,
							children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex, {
								align: BDFDB.LibraryComponents.Flex.Align.CENTER,
								children: [
									BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex.Child, {
										children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TextInput, {
											placeholder: customUrl,
											placeholder: "Insert Raw Github Link of Plugin (https://raw.githubusercontent.com/...)",
											onChange: value => {customUrl = value.trim();}
										})
									}),
									BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Button, {
										onClick: _ => {
											if (customUrl) {
												customList.push(customUrl);
												BDFDB.DataUtils.save(BDFDB.ArrayUtils.removeCopies(customList), this, "custom");
												BDFDB.PluginUtils.refreshSettingsPanel(this, settingsPanel, collapseStates);
											}
										},
										children: BDFDB.LanguageUtils.LanguageStrings.ADD
									})
								]
							})
						}),
						customList.length ? BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsPanelList, {
							title: "Custom Plugin List:",
							className: BDFDB.disCNS.margintop8 + BDFDB.disCN.marginbottom20,
							children: customList.map(url => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Card, {
								children: url,
								onRemove: _ => {
									BDFDB.ArrayUtils.remove(customList, url, true);
									BDFDB.DataUtils.save(customList, this, "custom");
									BDFDB.PluginUtils.refreshSettingsPanel(this, settingsPanel, collapseStates);
								}
							}))
						}) : null,
						BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsItem, {
							type: "Button",
							color: BDFDB.LibraryComponents.Button.Colors.RED,
							label: "Remove all custom added Plugins",
							onClick: _ => {
								BDFDB.ModalUtils.confirm(this, "Are you sure you want to remove all added Plugins from your own list", _ => {
									BDFDB.DataUtils.save([], this, "custom");
									BDFDB.PluginUtils.refreshSettingsPanel(this, settingsPanel, collapseStates);
								});
							},
							children: BDFDB.LanguageUtils.LanguageStrings.REMOVE
						})
					].flat(10).filter(n => n)
				}));
				
				return settingsPanel = BDFDB.PluginUtils.createSettingsPanel(this, settingsItems);
			}
			
			onSettingsClosed () {
				if (this.SettingsUpdated) {
					delete this.SettingsUpdated;
					this.forceUpdateAll();
				}
			}
			
			forceUpdateAll () {
				settings = BDFDB.DataUtils.get(this, "settings");
				modalSettings = BDFDB.DataUtils.get(this, "modalSettings");
				favorites = BDFDB.DataUtils.load(this, "favorites");
				favorites = BDFDB.ArrayUtils.is(favorites) ? favorites : [];
				customList = BDFDB.DataUtils.load(this, "custom");
				customList = BDFDB.ArrayUtils.is(customList) ? customList : [];
				
				BDFDB.PatchUtils.forceAllUpdates(this);
			}

			onUserSettingsCogContextMenu (e) {
				BDFDB.TimeUtils.timeout(_ => {
					let [children, index] = BDFDB.ReactUtils.findParent(e.returnvalue, {props: [["label", ["BandagedBD", "BetterDiscord"]]]});
					if (index > -1 && BDFDB.ArrayUtils.is(children[index].props.children)) children[index].props.children.push(BDFDB.ContextMenuUtils.createItem(BDFDB.LibraryComponents.MenuItems.MenuItem, {
						label: "Plugin Repo",
						id: BDFDB.ContextMenuUtils.createItemId(this.name, "repo"),
						action: _ => {
							BDFDB.LibraryModules.UserSettingsUtils.open("pluginrepo");
						}
					}));
				});
			}
			
			processSettingsView (e) {
				if (BDFDB.ArrayUtils.is(e.instance.props.sections) && e.instance.props.sections[0] && e.instance.props.sections[0].label == BDFDB.LanguageUtils.LanguageStrings.USER_SETTINGS) {
					e.instance.props.sections = e.instance.props.sections.filter(n => n.section != "pluginrepo");
					let index = e.instance.props.sections.indexOf(e.instance.props.sections.find(n => n.section == "themes") || e.instance.props.sections.find(n => n.section == BDFDB.DiscordConstants.UserSettingsSections.DEVELOPER_OPTIONS) || e.instance.props.sections.find(n => n.section == BDFDB.DiscordConstants.UserSettingsSections.HYPESQUAD_ONLINE));
					if (index > -1) {
						e.instance.props.sections.splice(index + 1, 0, {
							section: "pluginrepo",
							label: "Plugin Repo",
							element: _ => {
								let options = Object.assign({}, modalSettings);
								options.updated = options.updated && !showOnlyOutdated;
								options.outdated = options.outdated || showOnlyOutdated;
								options.downloadable = options.downloadable && !showOnlyOutdated;
								options.searchString = "";
								options.sortKey = forcedSort || Object.keys(sortKeys)[0];
								options.orderKey = forcedOrder || Object.keys(orderKeys)[0];
								
								return BDFDB.ReactUtils.createElement(RepoListComponent, options, true);
							}
						});
						if (!e.instance.props.sections.find(n => n.section == "plugins")) e.instance.props.sections.splice(index + 1, 0, {section: "DIVIDER"});
					}
				}
			}
			
			processStandardSidebarView (e) {
				if (e.instance.props.section == "pluginrepo") {
					let content = BDFDB.ReactUtils.findChild(e.returnvalue, {props: [["className", BDFDB.disCN.settingswindowcontentregion]]});
					if (content) content.props.className = BDFDB.DOMUtils.formatClassName(BDFDB.disCN._repolistwrapper, content.props.className);
					let [children, index] = BDFDB.ReactUtils.findParent(e.returnvalue, {props: [["className", BDFDB.disCN.settingswindowcontentregionscroller]]});
					if (index > -1) {
						let options = {};
						options.searchString = "";
						options.sortKey = forcedSort || Object.keys(sortKeys)[0];
						options.orderKey = forcedOrder || Object.keys(orderKeys)[0];
						children[index] = [
							BDFDB.ReactUtils.createElement(RepoListHeaderComponent, options, true),
							children[index]
						];
					}
				}
			}

			loadPlugins () {
				BDFDB.DOMUtils.remove(BDFDB.dotCN._pluginrepoloadingicon);
				let settings = BDFDB.DataUtils.load(this, "settings");
				let getPluginInfo, setPluginParameter;
				let outdated = 0, newEntries = 0, i = 0;
				let tags = ["getName", "getVersion", "getAuthor", "getDescription"];
				let seps = ["\"", "\'", "\`"];
				let newEntriesData = BDFDB.DataUtils.load(this, "newentriesdata");
				cachedPlugins = (newEntriesData.urlbase64 ? atob(newEntriesData.urlbase64).split("\n") : []).concat(customList);
				BDFDB.LibraryRequires.request("https://mwittrien.github.io/BetterDiscordAddons/Plugins/PluginRepo/_res/PluginList.txt", (error, response, result) => {
					if (!error && result) {
						result = result.replace(/[\r\t]/g, "");
						BDFDB.DataUtils.save(btoa(result), this, "newentriesdata", "urlbase64");
						
						loadedPlugins = {};
						grabbedPlugins = result.split("\n").filter(n => n);
						foundPlugins = grabbedPlugins.concat(customList);
						
						loading = {is: true, timeout: BDFDB.TimeUtils.timeout(_ => {
							BDFDB.TimeUtils.clear(loading.timeout);
							if (this.started) {
								if (loading.is && loading.amount < 4) BDFDB.TimeUtils.timeout(_ => {this.loadPlugins();},10000);
								loading = {is: false, timeout: null, amount: loading.amount};
							}
						}, 1200000), amount: loading.amount+1};
						
						let loadingIcon = BDFDB.DOMUtils.create(pluginRepoIcon.replace(/COLOR_1/gi, "var(--bdfdb-blurple)").replace(/COLOR_2/gi, "#72767d"));
						BDFDB.DOMUtils.addClass(loadingIcon, BDFDB.disCN._pluginrepoloadingicon);
						loadingIcon.addEventListener("mouseenter", _ => {
							BDFDB.TooltipUtils.create(loadingIcon, this.getLoadingTooltipText(), {
								type: "left",
								className: BDFDB.disCN._pluginrepoloadingtooltip,
								delay: 500,
								style: "max-width: unset;"
							});
						});
						BDFDB.PluginUtils.addLoadingIcon(loadingIcon);
						
						BDFDB.ReactUtils.forceUpdate(list, header);

						getPluginInfo(_ => {
							if (!this.started) {
								BDFDB.TimeUtils.clear(loading.timeout);
								return;
							}
							BDFDB.TimeUtils.clear(loading.timeout);
							BDFDB.DOMUtils.remove(loadingIcon, BDFDB.dotCN._pluginrepoloadingicon);
							loading = {is: false, timeout: null, amount: loading.amount};
							
							BDFDB.LogUtils.log("Finished fetching Plugins", this);
							if (list) BDFDB.ReactUtils.forceUpdate(list);
							
							if (settings.notifyOutdated && outdated > 0) {
								let notice = document.querySelector(BDFDB.dotCN._pluginrepooutdatednotice);
								if (notice) notice.close();
								BDFDB.NotificationUtils.notice(this.labels.notice_outdated_plugins.replace("{{var0}}", outdated), {
									type: "danger",
									className: BDFDB.disCNS._pluginreponotice + BDFDB.disCN._pluginrepooutdatednotice,
									customIcon: pluginRepoIcon.replace(/COLOR_[0-9]+/gi, "currentColor"),
									buttons: [{
										contents: BDFDB.LanguageUtils.LanguageStrings.OPEN,
										close: true,
										onClick: _ => {
											showOnlyOutdated = true;
											BDFDB.LibraryModules.UserSettingsUtils.open("pluginrepo");
										}
									}]
								});
							}
							
							if (settings.notifyNewEntries && newEntries > 0) {
								let notice = document.querySelector(BDFDB.dotCN._pluginreponewentriesnotice);
								if (notice) notice.close();
								BDFDB.NotificationUtils.notice(this.labels.notice_new_plugins.replace("{{var0}}", newEntries), {
									type: "success",
									className: BDFDB.disCNS._pluginreponotice + BDFDB.disCN._pluginreponewentriesnotice,
									customIcon: pluginRepoIcon.replace(/COLOR_[0-9]+/gi, "currentColor"),
									buttons: [{
										contents: BDFDB.LanguageUtils.LanguageStrings.OPEN,
										close: true,
										onClick: _ => {
											forcedSort = "NEW";
											forcedOrder = "ASC";
											BDFDB.LibraryModules.UserSettingsUtils.open("pluginrepo");
										}
									}]
								});
							}
							
							if (BDFDB.UserUtils.me.id == "278543574059057154") {
								let notice = document.querySelector(BDFDB.dotCN._pluginrepofailnotice);
								if (notice) notice.close();
								let wrongUrls = [];
								for (let url of foundPlugins) if (url && !loadedPlugins[url] && !wrongUrls.includes(url)) wrongUrls.push(url);
								if (wrongUrls.length) {
									BDFDB.NotificationUtils.notice(this.labels.notice_failed_plugins.replace("{{var0}}", wrongUrls.length), {
										type: "danger",
										className: BDFDB.disCNS._pluginreponotice + BDFDB.disCN._pluginrepofailnotice,
										customIcon: pluginRepoIcon.replace(/COLOR_[0-9]+/gi, "currentColor"),
										buttons: [{
											contents: this.labels.list,
											onClick: _ => {
												let toast = BDFDB.NotificationUtils.toast(wrongUrls.join("\n"), {type: "danger"});
												toast.style.setProperty("overflow", "hidden");
												for (let url of wrongUrls) console.log(url);
											}
										}]
									});
								}
							}
						});
					}
				});
				
				setPluginParameter = (plugin, tag, value) => {
					value = value ? value.split("\n")[0] : null;
					value = value && tag != "getVersion" ? value.charAt(0).toUpperCase() + value.slice(1) : value;
					plugin[tag] = value ? value.trim() : value;
				};

				getPluginInfo = callback => {
					if (i >= foundPlugins.length || !this.started || !loading.is) {
						callback();
						return;
					}
					let url = foundPlugins[i];
					BDFDB.LibraryRequires.request(url, (error, response, body) => {
						if (!response) {
							if (url && BDFDB.ArrayUtils.getAllIndexes(foundPlugins, url).length < 2) foundPlugins.push(url);
						}
						else if (body && body.indexOf("404: Not Found") != 0 && response.statusCode == 200) {
							let plugin = {};
							let bodyCopy = body;
							if (body.length / body.split("\n").length > 1000) {
								/* code is minified -> add newlines */
								bodyCopy = body.replace(/}/g, "}\n");
							}
							
							let configFound = false, configWrapper = bodyCopy.replace(/[\n\r\t"'`]/g, "").split(/(\s+config|\s+script|\.exports)\s*=\s*\{/g)[2];
							if (configWrapper) {
								configFound = true;
								let i = 0, j = 0, configString = "";
								try {
									for (let c of `{${configWrapper}`) {
										configString += c;
										if (c == "{") i++;
										else if (c == "}") j++;
										if (i > 0 && i == j) break;
									}
									for (let tag of tags) {
										let result = new RegExp(`[\\s\{\\}\[\\:,]${tag.replace("get", "").toLowerCase()}\\s*:\\s*([^\\{^\\}^\\[^\\]^:^,]+)`, "gi").exec(configString);
										if (result) setPluginParameter(plugin, tag, result[1]);
									}
									if (!plugin.getAuthor) plugin.getAuthor = ((new RegExp(`[\\s\{\\}\[\\:,]authors\\s*:\\s*\\[\\s*(.+?)\\s*\\]`, "gi").exec(configString) || [])[1] || "").split(/[\{\}\[\]:,]+\s*name\s*:/gi).slice(1).map(n => n.split(",")[0]).join(", ").trim();
									if (!plugin.getDescription) {
										let result = new RegExp(`[\\s\{\\}\[\\:,]desc\\s*:\\s*([^\\{^\\}^\\[^\\]^:^,]+)`, "gi").exec(configString);
										if (result) setPluginParameter(plugin, "getDescription", result[1]);
									}
									if (tags.some(tag => !plugin[tag])) configFound = false;
								}
								catch (err) {configFound = false;}
							}
							
							if (!configFound) {
								let hasMETAline = bodyCopy.replace(/\s/g, "").indexOf("//META{");
								if (!(hasMETAline < 20 && hasMETAline > -1)) {
									let searchText = bodyCopy.replace(/[\r\t| ]*\*\s*/g, "*");
									for (let tag of tags) setPluginParameter(plugin, tag, searchText.split(`@${tag.toLowerCase().slice(3)} `)[1]);
								}
								if (tags.some(tag => !plugin[tag])) {
									for (let tag of tags) {
										let result = new RegExp(tag + "[\\s|\\t|\\n|\\r|=|>|_|:|function|\(|\)|\{|return]*([\"|\'|\`]).*\\1", "gi").exec(bodyCopy);
										if (!result) result = new RegExp("get " + tag.replace("get", "").toLowerCase() + "[\\s|\\t|\\n|\\r|=|>|_|:|function|\(|\)|\{|return]*([\"|\'|\`]).*\\1","gi").exec(bodyCopy);
										if (result) {
											let separator = result[1];
											result = result[0].replace(new RegExp("\\\\" + separator, "g"), separator).split(separator);
											if (result.length > 2) setPluginParameter(plugin, tag, result.slice(1, -1).join(separator).replace(/\\n/g, "\n").replace(/\\/g, ""));
										}
									}
								}
							}
							
							if (!tags.some(tag => !plugin[tag] || plugin[tag].length > 10000)) {
								plugin.url = url;
								loadedPlugins[url] = plugin;
								if (this.isPluginOutdated(plugin, url)) outdated++;
								if (!cachedPlugins.includes(url)) newEntries++;
							}
						}
						i++;
						
						let loadingTooltip = document.querySelector(BDFDB.dotCN._pluginrepoloadingtooltip);
						if (loadingTooltip) loadingTooltip.update(this.getLoadingTooltipText());
						
						getPluginInfo(callback);
					});
				};
			}

			getLoadingTooltipText () {
				return BDFDB.LanguageUtils.LibraryStringsFormat("loading", `Plugin Repo - [${Object.keys(loadedPlugins).length}/${Object.keys(grabbedPlugins).length}]`);
			}
			
			isPluginOutdated (plugin, url) {
				let instPlugin = BDFDB.BDUtils.getPlugin(plugin.getName);
				return instPlugin && typeof instPlugin.getAuthor == "function" && this.getString(instPlugin.getAuthor()).toUpperCase() == plugin.getAuthor.toUpperCase() && this.getString(instPlugin.getVersion()) != plugin.getVersion && !BDFDB.PluginUtils.hasUpdateCheck(url);
			}

			getString (obj) {
				let string = "";
				if (typeof obj == "string") string = obj;
				else if (obj && obj.props) {
					if (typeof obj.props.children == "string") string = obj.props.children;
					else if (Array.isArray(obj.props.children)) for (let c of obj.props.children) string += typeof c == "string" ? c : this.getString(c);
				}
				return string;
			}

			checkForNewPlugins () {
				BDFDB.LibraryRequires.request("https://mwittrien.github.io/BetterDiscordAddons/Plugins/PluginRepo/_res/PluginList.txt", (error, response, result) => {
					if (response && !BDFDB.equals(result.replace(/\t|\r/g, "").split("\n").filter(n => n), grabbedPlugins)) {
						loading = {is: false, timeout: null, amount: 0};
						this.loadPlugins();
					}
				});
			}

			downloadPlugin (data) {
				BDFDB.LibraryRequires.request(data.url, (error, response, body) => {
					if (error) BDFDB.NotificationUtils.toast(BDFDB.LanguageUtils.LibraryStringsFormat("download_fail", `Plugin "${data.getName}"`), {type: "danger"});
					else this.createPluginFile(data.url.split("/").pop(), body);
				});
			}

			createPluginFile (filename, content) {
				BDFDB.LibraryRequires.fs.writeFile(BDFDB.LibraryRequires.path.join(BDFDB.BDUtils.getPluginsFolder(), filename), content, (error) => {
					if (error) BDFDB.NotificationUtils.toast(BDFDB.LanguageUtils.LibraryStringsFormat("save_fail", `Plugin "${filename}"`), {type: "danger"});
					else BDFDB.NotificationUtils.toast(BDFDB.LanguageUtils.LibraryStringsFormat("save_success", `Plugin "${filename}"`), {type: "success"});
				});
			}

			startPlugin (data) {
				if (data.name && BDFDB.BDUtils.isPluginEnabled(data.name) == false) {
					BDFDB.BDUtils.enablePlugin(data.name, false);
					BDFDB.LogUtils.log(BDFDB.LanguageUtils.LibraryStringsFormat("toast_plugin_started", data.name), this);
				}
			}

			deletePluginFile (data) {
				let filename = data.url.split("/").pop();
				BDFDB.LibraryRequires.fs.unlink(BDFDB.LibraryRequires.path.join(BDFDB.BDUtils.getPluginsFolder(), filename), (error) => {
					if (error) BDFDB.NotificationUtils.toast(BDFDB.LanguageUtils.LibraryStringsFormat("delete_fail", `Plugin "${filename}"`), {type: "danger"});
					else BDFDB.NotificationUtils.toast(BDFDB.LanguageUtils.LibraryStringsFormat("delete_success", `Plugin "${filename}"`));
				});
			}

			stopPlugin (data) {
				if (data.name && BDFDB.BDUtils.isPluginEnabled(data.name) == true) {
					BDFDB.BDUtils.disablePlugin(data.name, false);
					BDFDB.LogUtils.log(BDFDB.LanguageUtils.LibraryStringsFormat("toast_plugin_stopped", data.name), this);
				}
			}

			setLabelsByLanguage () {
				switch (BDFDB.LanguageUtils.getLanguage().id) {
					case "bg":		// Bulgarian
						return {
							list:								"Списък",
							notice_failed_plugins:				"Някои Plugins [{{var0}}] не можаха да бъдат заредени",
							notice_new_plugins:					"Новите Plugins [{{var0}}] бяха добавени към Plugin Repo",
							notice_outdated_plugins:			"Някои Plugins [{{var0}}] са остарели"
						};
					case "da":		// Danish
						return {
							list:								"Liste",
							notice_failed_plugins:				"Nogle Plugins [{{var0}}] kunne ikke indlæses",
							notice_new_plugins:					"Nye Plugins [{{var0}}] er blevet føjet til Plugin Repo",
							notice_outdated_plugins:			"Nogle Plugins [{{var0}}] er forældede"
						};
					case "de":		// German
						return {
							list:								"Liste",
							notice_failed_plugins:				"Einige Plugins [{{var0}}] konnten nicht geladen werden",
							notice_new_plugins:					"Neue Plugins [{{var0}}] wurden zur Plugin Repo hinzugefügt",
							notice_outdated_plugins:			"Einige Plugins [{{var0}}] sind veraltet"
						};
					case "el":		// Greek
						return {
							list:								"Λίστα",
							notice_failed_plugins:				"Δεν ήταν δυνατή η φόρτωση ορισμένων Plugins [{{var0}}] ",
							notice_new_plugins:					"Προστέθηκαν νέα Plugins [{{var0}}] στο Plugin Repo",
							notice_outdated_plugins:			"Ορισμένα Plugins [{{var0}}] είναι παλιά"
						};
					case "es":		// Spanish
						return {
							list:								"Lista",
							notice_failed_plugins:				"Algunos Plugins [{{var0}}] no se pudieron cargar",
							notice_new_plugins:					"Se han agregado nuevos Plugins [{{var0}}] a Plugin Repo",
							notice_outdated_plugins:			"Algunas Plugins [{{var0}}] están desactualizadas"
						};
					case "fi":		// Finnish
						return {
							list:								"Lista",
							notice_failed_plugins:				"Joitain kohdetta Plugins [{{var0}}] ei voitu ladata",
							notice_new_plugins:					"Uusi Plugins [{{var0}}] on lisätty Plugin Repo",
							notice_outdated_plugins:			"Jotkut Plugins [{{var0}}] ovat vanhentuneita"
						};
					case "fr":		// French
						return {
							list:								"Liste",
							notice_failed_plugins:				"Certains Plugins [{{var0}}] n'ont pas pu être chargés",
							notice_new_plugins:					"De nouveaux Plugins [{{var0}}] ont été ajoutés à Plugin Repo",
							notice_outdated_plugins:			"Certains Plugins [{{var0}}] sont obsolètes"
						};
					case "hr":		// Croatian
						return {
							list:								"Popis",
							notice_failed_plugins:				"Neke datoteke Plugins [{{var0}}] nije moguće učitati",
							notice_new_plugins:					"Novi Plugins [{{var0}}] dodani su u Plugin Repo",
							notice_outdated_plugins:			"Neki su Plugins [{{var0}}] zastarjeli"
						};
					case "hu":		// Hungarian
						return {
							list:								"Lista",
							notice_failed_plugins:				"Néhány Plugins [{{var0}}] nem sikerült betölteni",
							notice_new_plugins:					"Új Plugins [{{var0}}] hozzáadva a következőhöz: Plugin Repo",
							notice_outdated_plugins:			"Néhány Plugins [{{var0}}] elavult"
						};
					case "it":		// Italian
						return {
							list:								"Elenco",
							notice_failed_plugins:				"Impossibile caricare alcuni Plugins [{{var0}}] ",
							notice_new_plugins:					"Il nuovo Plugins [{{var0}}] è stato aggiunto a Plugin Repo",
							notice_outdated_plugins:			"Alcuni Plugins [{{var0}}] non sono aggiornati"
						};
					case "ja":		// Japanese
						return {
							list:								"リスト",
							notice_failed_plugins:				"一部の Plugins [{{var0}}] を読み込めませんでした",
							notice_new_plugins:					"新しい Plugins [{{var0}}] が Plugin Repo に追加されました",
							notice_outdated_plugins:			"一部の Plugins [{{var0}}] は古くなっています"
						};
					case "ko":		// Korean
						return {
							list:								"명부",
							notice_failed_plugins:				"일부 Plugins [{{var0}}] 을 (를)로드 할 수 없습니다.",
							notice_new_plugins:					"새 Plugins [{{var0}}] 이 Plugin Repo 에 추가되었습니다.",
							notice_outdated_plugins:			"일부 Plugins [{{var0}}] 이 오래되었습니다."
						};
					case "lt":		// Lithuanian
						return {
							list:								"Sąrašas",
							notice_failed_plugins:				"Kai kurių Plugins [{{var0}}] nepavyko įkelti",
							notice_new_plugins:					"Naujas Plugins [{{var0}}] pridėtas prie Plugin Repo",
							notice_outdated_plugins:			"Kai kurie Plugins [{{var0}}] yra pasenę"
						};
					case "nl":		// Dutch
						return {
							list:								"Lijst",
							notice_failed_plugins:				"Sommige Plugins [{{var0}}] konden niet worden geladen",
							notice_new_plugins:					"Nieuwe Plugins [{{var0}}] zijn toegevoegd aan de Plugin Repo",
							notice_outdated_plugins:			"Sommige Plugins [{{var0}}] zijn verouderd"
						};
					case "no":		// Norwegian
						return {
							list:								"Liste",
							notice_failed_plugins:				"Noen Plugins [{{var0}}] kunne ikke lastes inn",
							notice_new_plugins:					"Nye Plugins [{{var0}}] er lagt til i Plugin Repo",
							notice_outdated_plugins:			"Noen Plugins [{{var0}}] er utdaterte"
						};
					case "pl":		// Polish
						return {
							list:								"Lista",
							notice_failed_plugins:				"Nie można załadować niektórych Plugins [{{var0}}] ",
							notice_new_plugins:					"Nowe Plugins [{{var0}}] zostały dodane do Plugin Repo",
							notice_outdated_plugins:			"Niektóre Plugins [{{var0}}] są nieaktualne"
						};
					case "pt-BR":	// Portuguese (Brazil)
						return {
							list:								"Lista",
							notice_failed_plugins:				"Algum Plugins [{{var0}}] não pôde ser carregado",
							notice_new_plugins:					"Novo Plugins [{{var0}}] foi adicionado ao Plugin Repo",
							notice_outdated_plugins:			"Alguns Plugins [{{var0}}] estão desatualizados"
						};
					case "ro":		// Romanian
						return {
							list:								"Listă",
							notice_failed_plugins:				"Unele Plugins [{{var0}}] nu au putut fi încărcate",
							notice_new_plugins:					"Plugins [{{var0}}] nou au fost adăugate la Plugin Repo",
							notice_outdated_plugins:			"Unele Plugins [{{var0}}] sunt învechite"
						};
					case "ru":		// Russian
						return {
							list:								"Список",
							notice_failed_plugins:				"Не удалось загрузить некоторые Plugins [{{var0}}] ",
							notice_new_plugins:					"Новые Plugins [{{var0}}] добавлены в Plugin Repo",
							notice_outdated_plugins:			"Некоторые Plugins [{{var0}}] устарели"
						};
					case "sv":		// Swedish
						return {
							list:								"Lista",
							notice_failed_plugins:				"Vissa Plugins [{{var0}}] kunde inte laddas",
							notice_new_plugins:					"Nya Plugins [{{var0}}] har lagts till i Plugin Repo",
							notice_outdated_plugins:			"Vissa Plugins [{{var0}}] är föråldrade"
						};
					case "th":		// Thai
						return {
							list:								"รายการ",
							notice_failed_plugins:				"ไม่สามารถโหลด Plugins [{{var0}}] บางรายการได้",
							notice_new_plugins:					"เพิ่ม Plugins [{{var0}}] ใหม่ใน Plugin Repo แล้ว",
							notice_outdated_plugins:			"Plugins [{{var0}}] บางรายการล้าสมัย"
						};
					case "tr":		// Turkish
						return {
							list:								"Liste",
							notice_failed_plugins:				"Bazı Plugins [{{var0}}] yüklenemedi",
							notice_new_plugins:					"Yeni Plugins [{{var0}}], Plugin Repo 'ye eklendi",
							notice_outdated_plugins:			"Bazı Plugins [{{var0}}] güncel değil"
						};
					case "uk":		// Ukrainian
						return {
							list:								"Список",
							notice_failed_plugins:				"Деякі Plugins [{{var0}}] не вдалося завантажити",
							notice_new_plugins:					"Нові Plugins [{{var0}}] були додані до Plugin Repo",
							notice_outdated_plugins:			"Деякі Plugins [{{var0}}] застарілі"
						};
					case "vi":		// Vietnamese
						return {
							list:								"Danh sách",
							notice_failed_plugins:				"Không thể tải một số Plugins [{{var0}}] ",
							notice_new_plugins:					"Plugins [{{var0}}] mới đã được thêm vào Plugin Repo",
							notice_outdated_plugins:			"Một số Plugins [{{var0}}] đã lỗi thời"
						};
					case "zh-CN":	// Chinese (China)
						return {
							list:								"清单",
							notice_failed_plugins:				"某些 Plugins [{{var0}}] 无法加载",
							notice_new_plugins:					"新的 Plugins [{{var0}}] 已添加到 Plugin Repo",
							notice_outdated_plugins:			"一些 Plugins [{{var0}}] 已过时"
						};
					case "zh-TW":	// Chinese (Taiwan)
						return {
							list:								"清單",
							notice_failed_plugins:				"某些 Plugins [{{var0}}] 無法加載",
							notice_new_plugins:					"新的 Plugins [{{var0}}] 已添加到 Plugin Repo",
							notice_outdated_plugins:			"一些 Plugins [{{var0}}] 已過時"
						};
					default:		// English
						return {
							list:								"List",
							notice_failed_plugins:				"Some Plugins [{{var0}}] could not be loaded",
							notice_new_plugins:					"New Plugins [{{var0}}] have been added to the Plugin Repo",
							notice_outdated_plugins:			"Some Plugins [{{var0}}] are outdated"
						};
				}
			}
		};
	})(window.BDFDB_Global.PluginUtils.buildPlugin(config));
})();